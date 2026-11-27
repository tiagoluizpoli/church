import { fromDate } from '@church/time';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChurchId,
  CycleId,
  EventId,
  RoleId,
  ShiftId,
} from '@/domain/branded-ids';
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import { DrizzleEventRepository } from '@/infrastructure/repositories/drizzle-event.repository';
import { DrizzleRoleRepository } from '@/infrastructure/repositories/drizzle-role.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import {
  asTxContext,
  DrizzleTransactionContext,
} from '@/infrastructure/repositories/drizzle-transaction-context';
import { buildRole } from '@/seeds/builders/ministry';
import { buildShift } from '@/seeds/builders/scheduling';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  type SchedulingPhase3Seed,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

const MISSING_ID = '99999999-9999-4999-8999-999999999999';

interface SeedGraphInput {
  churchId: string;
  ministryId: string;
  day: number;
}

async function seedGraph({ churchId, ministryId, day }: SeedGraphInput) {
  const date = `2026-08-${String(day).padStart(2, '0')}`;
  const cycle = await createSchedulingPhase3Cycle({
    churchId,
    name: `Cycle ${day}`,
    startDate: new Date(`${date}T00:00:00.000Z`),
    endDate: new Date(`${date}T00:00:00.000Z`),
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId: cycle.id,
    ministryId,
    title: `Service ${day}`,
    start: new Date(`${date}T09:00:00.000Z`),
    end: new Date(`${date}T11:00:00.000Z`),
  });
  return { cycle, ...graph };
}

/** Two graphs in Church A (earlier day first) and one in Church B. */
async function seedTwoChurches(seed: SchedulingPhase3Seed) {
  const own = { churchId: seed.churchAId, ministryId: seed.ministryAId };
  const earlier = await seedGraph({ ...own, day: 2 });
  const later = await seedGraph({ ...own, day: 9 });
  const foreign = await seedGraph({
    churchId: seed.churchBId,
    ministryId: seed.ministryBId,
    day: 5,
  });
  return { earlier, later, foreign };
}

describe('batch by-ids reads', () => {
  let seed: SchedulingPhase3Seed;
  let churchId: ChurchId;

  beforeEach(async () => {
    await resetSchedulingPhase3Db();
    seed = await seedSchedulingPhase3Base();
    churchId = ChurchId.from(seed.churchAId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Events: one statement, own Church only, missing ids absent', async () => {
    const { earlier, later, foreign } = await seedTwoChurches(seed);
    const repo = new DrizzleEventRepository({ db: schedulingTestDb });
    const ids = [
      later.event.id,
      MISSING_ID,
      foreign.event.id,
      earlier.event.id,
    ];
    const eventIds = ids.map((id) => EventId.from(id));
    const queries = vi.spyOn(pg.Client.prototype, 'query');

    const found = await repo.listByIds({ churchId, eventIds });
    expect(queries).toHaveBeenCalledTimes(1);
    expect(found.map(({ id }) => id)).toEqual([
      earlier.event.id,
      later.event.id,
    ]);

    queries.mockClear();
    expect(await repo.listByIds({ churchId, eventIds: [] })).toEqual([]);
    expect(queries).not.toHaveBeenCalled();
  });

  it('Shifts: one statement, own Church only, missing ids absent', async () => {
    const { earlier, later, foreign } = await seedTwoChurches(seed);
    const addShift = (graph: typeof earlier) =>
      buildShift({
        db: schedulingTestDb,
        churchId: graph.event.churchId,
        participationId: graph.participation.id,
        eventTimeBlockId: graph.eventTimeBlock.id,
        start: fromDate({ date: graph.eventTimeBlock.startTime }),
        end: fromDate({ date: graph.eventTimeBlock.endTime }),
      });
    const first = await addShift(earlier);
    const second = await addShift(later);
    const other = await addShift(foreign);
    const repo = new DrizzleShiftRepository({ db: schedulingTestDb });
    const ids = [second.id, MISSING_ID, other.id, first.id];
    const shiftIds = ids.map((id) => ShiftId.from(id));
    const queries = vi.spyOn(pg.Client.prototype, 'query');

    const found = await repo.listByIds({ churchId, shiftIds });
    expect(queries).toHaveBeenCalledTimes(1);
    expect(found.map(({ id }) => id)).toEqual([first.id, second.id]);

    queries.mockClear();
    expect(await repo.listByIds({ churchId, shiftIds: [] })).toEqual([]);
    expect(queries).not.toHaveBeenCalled();
  });

  it('Roles: one statement, own Church only, missing ids absent, archived kept', async () => {
    const own = { churchId: seed.churchAId, ministryId: seed.ministryAId };
    const drums = await buildRole({
      db: schedulingTestDb,
      ...own,
      name: 'Drums',
    });
    const bass = await buildRole({
      db: schedulingTestDb,
      ...own,
      name: 'Bass',
    });
    const other = await buildRole({
      db: schedulingTestDb,
      churchId: seed.churchBId,
      ministryId: seed.ministryBId,
      name: 'Choir',
    });
    const repo = new DrizzleRoleRepository({ db: schedulingTestDb });
    await schedulingTestDb.transaction(async (tx) => {
      await repo.archive({
        churchId,
        roleId: RoleId.from(bass.id),
        archivedAt: fromDate({ date: new Date('2026-08-01T00:00:00.000Z') }),
        tx: asTxContext(new DrizzleTransactionContext({ tx })),
      });
    });
    const ids = [drums.id, MISSING_ID, other.id, bass.id];
    const roleIds = ids.map((id) => RoleId.from(id));
    const queries = vi.spyOn(pg.Client.prototype, 'query');

    const found = await repo.listByIds({ churchId, roleIds });
    expect(queries).toHaveBeenCalledTimes(1);
    expect(found.map(({ id }) => id)).toEqual([bass.id, drums.id]);

    queries.mockClear();
    expect(await repo.listByIds({ churchId, roleIds: [] })).toEqual([]);
    expect(queries).not.toHaveBeenCalled();
  });

  it('Cycles: one statement, own Church only, missing ids absent', async () => {
    const { earlier, later, foreign } = await seedTwoChurches(seed);
    const repo = new DrizzleCycleRepository({ db: schedulingTestDb });
    const ids = [
      earlier.cycle.id,
      MISSING_ID,
      foreign.cycle.id,
      later.cycle.id,
    ];
    const cycleIds = ids.map((id) => CycleId.from(id));
    const queries = vi.spyOn(pg.Client.prototype, 'query');

    const found = await repo.listByIds({ churchId, cycleIds });
    expect(queries).toHaveBeenCalledTimes(1);
    expect(found.map(({ id }) => id)).toEqual([
      later.cycle.id,
      earlier.cycle.id,
    ]);

    queries.mockClear();
    expect(await repo.listByIds({ churchId, cycleIds: [] })).toEqual([]);
    expect(queries).not.toHaveBeenCalled();
  });
});
