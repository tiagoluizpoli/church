import { NotFoundError } from '@church/core';
import { cycle, event } from '@church/db';
import { type CalendarDay, fromDateColumn, nowAsDate } from '@church/time';
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  max,
  ne,
  notInArray,
  sql,
} from 'drizzle-orm';
import type {
  AcquireCycleChurchLockInput,
  CountCycleEventsInput,
  CountCyclesByStateInput,
  CreateCycleInput,
  CycleRepository,
  DeleteCycleInput,
  FindCycleAnchorsInput,
  FindLatestCycleEndInput,
  FindOverlappingCyclesInput,
  GetCycleInput,
  ListCyclesByIdsInput,
  ListCyclesInput,
  RefuseExclusionRaceInput,
  ResolveElapsedCyclesInput,
  UpdateCycleInput,
  UpdateCycleStateInput,
} from '../../domain/contracts/infrastructure/cycle.repository';
import type {
  Cycle,
  CycleAnchors,
  CycleStateCounts,
} from '../../domain/entities/cycle';
import { OverlappingCycleError } from '../../domain/errors/overlapping-cycle';
import { mapCycle } from '../mappers/cycle.mapper';
import type { DrizzleCycleRepositoryInput } from './drizzle-cycle.repository.types';
import type { AnyDrizzleDb } from './drizzle-db.types';
import {
  containsPattern,
  getClient,
  isValidUuid,
  withChurchIsolation,
} from './helpers';
import {
  isConstraintViolation,
  PG_EXCLUSION_VIOLATION,
} from './unique-violation';

/** The Church-scoped inclusive daterange exclusion (migration 0042). */
const CHURCH_DATE_EXCLUSION_CONSTRAINT = 'cycle_church_date_excl';

/** The Church's Cycles narrowed by `list`'s optional filters. */
function listConditions(input: ListCyclesInput) {
  const conditions = [
    withChurchIsolation({ table: cycle, churchId: input.churchId }),
  ];
  if (input.states) {
    conditions.push(inArray(cycle.state, input.states));
  }
  if (input.search) {
    conditions.push(
      ilike(cycle.name, containsPattern({ value: input.search })),
    );
  }
  if (input.from) {
    conditions.push(gte(cycle.endDate, input.from));
  }
  if (input.to) {
    conditions.push(lte(cycle.startDate, input.to));
  }
  return and(...conditions);
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
    const rows = await db
      .select()
      .from(cycle)
      .where(listConditions(input))
      // Newest first; Cycles of one Church never overlap, so id only keeps the
      // order total.
      .orderBy(desc(cycle.startDate), desc(cycle.endDate), cycle.id);

    return rows.map(mapCycle);
  }

  async count(input: ListCyclesInput): Promise<number> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .select({ total: count() })
      .from(cycle)
      .where(listConditions(input));
    return row?.total ?? 0;
  }

  async resolveElapsed(input: ResolveElapsedCyclesInput): Promise<void> {
    const db = getClient({ db: this.db, tx: input.tx });
    await db
      .update(cycle)
      .set({ state: 'past', updatedAt: nowAsDate() })
      .where(
        and(
          withChurchIsolation({ table: cycle, churchId: input.churchId }),
          ne(cycle.state, 'past'),
          // endDate is the Cycle's last day: it elapses on the following day.
          lt(cycle.endDate, input.today),
        ),
      );
  }

  async countByState(
    input: CountCyclesByStateInput,
  ): Promise<CycleStateCounts> {
    const db = getClient({ db: this.db, tx: input.tx });
    // list-order: grouped counts read into a per-state record
    const rows = await db
      .select({ state: cycle.state, total: count() })
      .from(cycle)
      .where(withChurchIsolation({ table: cycle, churchId: input.churchId }))
      .groupBy(cycle.state);
    const counts: CycleStateCounts = { draft: 0, sent: 0, past: 0 };
    for (const row of rows) {
      counts[row.state] = row.total;
    }
    return counts;
  }

  async findLatestEnd(
    input: FindLatestCycleEndInput,
  ): Promise<CalendarDay | null> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .select({ latestEnd: max(cycle.endDate) })
      .from(cycle)
      .where(withChurchIsolation({ table: cycle, churchId: input.churchId }));
    return row?.latestEnd ? fromDateColumn({ date: row.latestEnd }) : null;
  }

  async countEvents(
    input: CountCycleEventsInput,
  ): Promise<Record<string, number>> {
    if (input.cycleIds.length === 0) {
      return {};
    }
    const db = getClient({ db: this.db, tx: input.tx });
    // list-order: grouped counts read into a per-cycle record
    const rows = await db
      .select({ cycleId: event.cycleId, total: count() })
      .from(event)
      .where(
        and(
          withChurchIsolation({ table: event, churchId: input.churchId }),
          inArray(event.cycleId, input.cycleIds),
          ne(event.status, 'cancelled'),
        ),
      )
      .groupBy(event.cycleId);
    return Object.fromEntries(rows.map((row) => [row.cycleId, row.total]));
  }

  async getById(input: GetCycleInput): Promise<Cycle> {
    if (!isValidUuid(input.cycleId)) {
      throw new NotFoundError(`Cycle not found: ${input.cycleId}`);
    }

    const db = getClient({ db: this.db, tx: input.tx });
    // list-order: one cycle by primary key
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

  async listByIds({
    churchId,
    cycleIds,
    tx,
  }: ListCyclesByIdsInput): Promise<Cycle[]> {
    if (cycleIds.length === 0) return [];
    const rows = await getClient({ db: this.db, tx })
      .select()
      .from(cycle)
      .where(
        and(
          inArray(cycle.id, cycleIds),
          withChurchIsolation({ table: cycle, churchId }),
        ),
      )
      .orderBy(desc(cycle.startDate), desc(cycle.endDate), cycle.id);
    return rows.map(mapCycle);
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
      )
      .orderBy(cycle.startDate, cycle.id);

    return rows.map(mapCycle);
  }

  async findAnchors(input: FindCycleAnchorsInput): Promise<CycleAnchors> {
    const db = getClient({ db: this.db, tx: input.tx });
    const church = withChurchIsolation({
      table: cycle,
      churchId: input.churchId,
    });
    const [[current], [next]] = await Promise.all([
      db
        .select()
        .from(cycle)
        .where(
          and(
            church,
            lte(cycle.startDate, input.today),
            gte(cycle.endDate, input.today),
            notInArray(cycle.state, ['draft', 'past']),
          ),
        )
        .orderBy(cycle.startDate, cycle.id)
        .limit(1),
      db
        .select()
        .from(cycle)
        .where(
          and(
            church,
            gt(cycle.startDate, input.today),
            ne(cycle.state, 'past'),
          ),
        )
        .orderBy(cycle.startDate, cycle.id)
        .limit(1),
    ]);
    return {
      current: current ? mapCycle(current) : null,
      next: next ? mapCycle(next) : null,
    };
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
