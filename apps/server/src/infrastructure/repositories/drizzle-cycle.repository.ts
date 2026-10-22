import { NotFoundError } from '@church/core';
import { cycle } from '@church/db';
import { nowAsDate } from '@church/time';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type {
  AcquireCycleChurchLockInput,
  CreateCycleInput,
  CycleRepository,
  FindOverlappingCyclesInput,
  GetCycleInput,
  ListCyclesInput,
  UpdateCycleStateInput,
} from '../../domain/contracts/infrastructure/cycle.repository';
import type { Cycle } from '../../domain/entities/cycle';
import { mapCycle } from '../mappers/cycle.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleCycleRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleCycleRepository implements CycleRepository {
  constructor({ db }: DrizzleCycleRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async create(input: CreateCycleInput): Promise<Cycle> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .insert(cycle)
      .values({
        churchId: input.churchId,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        state: input.state ?? 'draft',
      })
      .returning();

    if (!row) {
      throw new Error('Cycle insert failed');
    }

    return mapCycle(row);
  }

  async list(input: ListCyclesInput): Promise<Cycle[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const conditions = [
      withChurchIsolation({ table: cycle, churchId: input.churchId }),
    ];

    if (input.state) {
      conditions.push(eq(cycle.state, input.state));
    }

    const rows = await db
      .select()
      .from(cycle)
      .where(and(...conditions))
      .orderBy(cycle.startDate);

    return rows.map(mapCycle);
  }

  async getById(input: GetCycleInput): Promise<Cycle> {
    if (!isValidUuid(input.cycleId)) {
      throw new NotFoundError(`Cycle not found: ${input.cycleId}`);
    }

    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .select()
      .from(cycle)
      .where(
        and(
          eq(cycle.id, input.cycleId),
          withChurchIsolation({ table: cycle, churchId: input.churchId }),
        ),
      );

    if (!row) {
      throw new NotFoundError(`Cycle not found: ${input.cycleId}`);
    }

    return mapCycle(row);
  }

  async findOverlapping(input: FindOverlappingCyclesInput): Promise<Cycle[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select()
      .from(cycle)
      .where(
        and(
          withChurchIsolation({ table: cycle, churchId: input.churchId }),
          lt(cycle.startDate, input.endDate),
          gt(cycle.endDate, input.startDate),
        ),
      );

    return rows.map(mapCycle);
  }

  async updateState(input: UpdateCycleStateInput): Promise<Cycle> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .update(cycle)
      .set({
        state: input.state,
        updatedAt: nowAsDate(),
      })
      .where(
        and(
          eq(cycle.id, input.cycleId),
          withChurchIsolation({ table: cycle, churchId: input.churchId }),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError(`Cycle not found: ${input.cycleId}`);
    }

    return mapCycle(row);
  }

  async acquireChurchLock(input: AcquireCycleChurchLockInput): Promise<void> {
    const db = getClient({ db: this.db, tx: input.tx });

    await db.execute(
      sql`select pg_advisory_xact_lock(hashtext(${input.churchId}))`,
    );
  }
}
