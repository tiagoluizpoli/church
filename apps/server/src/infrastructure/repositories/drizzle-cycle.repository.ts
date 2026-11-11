import { NotFoundError } from '@church/core';
import { cycle } from '@church/db';
import { nowAsDate } from '@church/time';
import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import type {
  AcquireCycleChurchLockInput,
  CreateCycleInput,
  CycleRepository,
  DeleteCycleInput,
  FindOverlappingCyclesInput,
  GetCycleInput,
  ListCyclesInput,
  UpdateCycleInput,
  UpdateCycleStateInput,
} from '../../domain/contracts/infrastructure/cycle.repository';
import type { Cycle } from '../../domain/entities/cycle';
import { OverlappingCycleError } from '../../domain/errors/overlapping-cycle';
import { mapCycle } from '../mappers/cycle.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';
import {
  isConstraintViolation,
  PG_EXCLUSION_VIOLATION,
} from './unique-violation';

/** The Church-scoped inclusive daterange exclusion (migration 0042). */
const CHURCH_DATE_EXCLUSION_CONSTRAINT = 'cycle_church_date_excl';

interface RefuseExclusionRaceInput {
  error: unknown;
  range: Omit<FindOverlappingCyclesInput, 'tx'>;
}

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
      .returning()
      .catch((error: unknown) =>
        this.refuseExclusionRace({ error, range: input }),
      );

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
      // Newest first; Cycles of one Church never overlap, so id only keeps the
      // order total.
      .orderBy(desc(cycle.startDate), desc(cycle.endDate), cycle.id);

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
          lte(cycle.startDate, input.endDate),
          gte(cycle.endDate, input.startDate),
          input.excludeCycleId ? ne(cycle.id, input.excludeCycleId) : undefined,
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
        // Stamped with Send in its transaction; no later transition clears it.
        ...(input.state === 'sent' ? { hasBeenSent: true } : {}),
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

  async delete(input: DeleteCycleInput): Promise<void> {
    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .delete(cycle)
      .where(
        and(
          eq(cycle.id, input.cycleId),
          withChurchIsolation({ table: cycle, churchId: input.churchId }),
        ),
      )
      .returning({ id: cycle.id });

    if (rows.length === 0) {
      throw new NotFoundError(`Cycle not found: ${input.cycleId}`);
    }
  }

  async update(input: UpdateCycleInput): Promise<Cycle> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .update(cycle)
      .set({
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        updatedAt: nowAsDate(),
      })
      .where(
        and(
          eq(cycle.id, input.cycleId),
          withChurchIsolation({ table: cycle, churchId: input.churchId }),
        ),
      )
      .returning()
      .catch((error: unknown) =>
        this.refuseExclusionRace({
          error,
          range: { ...input, excludeCycleId: input.cycleId },
        }),
      );

    if (!row) {
      throw new NotFoundError(`Cycle not found: ${input.cycleId}`);
    }

    return mapCycle(row);
  }

  private async refuseExclusionRace({
    error,
    range,
  }: RefuseExclusionRaceInput): Promise<never> {
    if (
      !isConstraintViolation({
        error,
        code: PG_EXCLUSION_VIOLATION,
        constraint: CHURCH_DATE_EXCLUSION_CONSTRAINT,
      })
    ) {
      throw error;
    }
    // The failed transaction is aborted; the committed winner is read
    // outside it, scoped to the Church, never from the PostgreSQL message.
    const conflicts = await this.findOverlapping({
      churchId: range.churchId,
      startDate: range.startDate,
      endDate: range.endDate,
      excludeCycleId: range.excludeCycleId,
    });
    throw new OverlappingCycleError({ conflictingCycles: conflicts });
  }

  async acquireChurchLock(input: AcquireCycleChurchLockInput): Promise<void> {
    const db = getClient({ db: this.db, tx: input.tx });

    await db.execute(
      sql`select pg_advisory_xact_lock(hashtext(${input.churchId}))`,
    );
  }
}
