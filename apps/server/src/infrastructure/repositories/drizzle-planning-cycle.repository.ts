import { NotFoundError } from '@church/core';
import { planningCycle } from '@church/db';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type {
  AcquirePlanningCycleChurchLockInput,
  CreatePlanningCycleInput,
  FindOverlappingPlanningCyclesInput,
  GetPlanningCycleInput,
  ListPlanningCyclesInput,
  PlanningCycleRepository,
  UpdatePlanningCycleStateInput,
} from '../../domain/contracts/infrastructure/planning-cycle.repository';
import type { PlanningCycle } from '../../domain/entities/planning-cycle';
import { mapPlanningCycle } from '../mappers/planning-cycle.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzlePlanningCycleRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzlePlanningCycleRepository implements PlanningCycleRepository {
  constructor({ db }: DrizzlePlanningCycleRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async create(input: CreatePlanningCycleInput): Promise<PlanningCycle> {
    const db = getClient(this.db, input.tx);
    const [row] = await db
      .insert(planningCycle)
      .values({
        churchId: input.churchId,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        state: input.state ?? 'draft',
      })
      .returning();

    if (!row) {
      throw new Error('Planning cycle insert failed');
    }

    return mapPlanningCycle(row);
  }

  async list(input: ListPlanningCyclesInput): Promise<PlanningCycle[]> {
    const db = getClient(this.db, input.tx);
    const conditions = [withChurchIsolation(planningCycle, input.churchId)];

    if (input.state) {
      conditions.push(eq(planningCycle.state, input.state));
    }

    const rows = await db
      .select()
      .from(planningCycle)
      .where(and(...conditions))
      .orderBy(planningCycle.startDate);

    return rows.map(mapPlanningCycle);
  }

  async getById(input: GetPlanningCycleInput): Promise<PlanningCycle> {
    if (!isValidUuid(input.cycleId)) {
      throw new NotFoundError(`Planning cycle not found: ${input.cycleId}`);
    }

    const db = getClient(this.db, input.tx);
    const [row] = await db
      .select()
      .from(planningCycle)
      .where(
        and(
          eq(planningCycle.id, input.cycleId),
          withChurchIsolation(planningCycle, input.churchId),
        ),
      );

    if (!row) {
      throw new NotFoundError(`Planning cycle not found: ${input.cycleId}`);
    }

    return mapPlanningCycle(row);
  }

  async findOverlapping(
    input: FindOverlappingPlanningCyclesInput,
  ): Promise<PlanningCycle[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select()
      .from(planningCycle)
      .where(
        and(
          withChurchIsolation(planningCycle, input.churchId),
          lt(planningCycle.startDate, input.endDate),
          gt(planningCycle.endDate, input.startDate),
        ),
      );

    return rows.map(mapPlanningCycle);
  }

  async updateState(
    input: UpdatePlanningCycleStateInput,
  ): Promise<PlanningCycle> {
    const db = getClient(this.db, input.tx);
    const [row] = await db
      .update(planningCycle)
      .set({
        state: input.state,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(planningCycle.id, input.cycleId),
          withChurchIsolation(planningCycle, input.churchId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError(`Planning cycle not found: ${input.cycleId}`);
    }

    return mapPlanningCycle(row);
  }

  async acquireChurchLock(
    input: AcquirePlanningCycleChurchLockInput,
  ): Promise<void> {
    const db = getClient(this.db, input.tx);

    await db.execute(
      sql`select pg_advisory_xact_lock(hashtext(${input.churchId}))`,
    );
  }
}
