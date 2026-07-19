import { NotFoundError } from '@church/core';
import { ministryParticipation, participationSlotInclusion } from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
} from '../../../src/domain/branded-ids';
import { DrizzleMinistryParticipationRepository } from '../../../src/infrastructure/repositories/drizzle-ministry-participation.repository';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

describe('DrizzleMinistryParticipationRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getById throws NotFoundError for an invalid uuid', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    await expect(
      repo.getById({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from('not-a-uuid'),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('listByIds returns [] without querying when participationIds is empty', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    const result = await repo.listByIds({
      churchId: ChurchId.from(seed.churchAId),
      participationIds: [],
    });
    expect(result).toEqual([]);
  });

  it('updateState throws NotFoundError when the participation does not exist', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    await expect(
      repo.updateState({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(
          '99999999-9999-4999-8999-999999999999',
        ),
        state: 'published',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('touch() sets touchedAt on first call and never overwrites it afterward', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation } = await seedCycleAndEvent({
      seed,
      state: 'locked',
    });
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);
    const participationId = MinistryParticipationId.from(participation.id);

    await repo.touch({ churchId, participationId });
    const [afterFirstTouch] = await schedulingTestDb
      .select()
      .from(ministryParticipation)
      .where(eq(ministryParticipation.id, participation.id));
    const firstTouchedAt = afterFirstTouch?.touchedAt;
    expect(firstTouchedAt).not.toBeNull();

    await repo.touch({ churchId, participationId });
    const [afterSecondTouch] = await schedulingTestDb
      .select()
      .from(ministryParticipation)
      .where(eq(ministryParticipation.id, participation.id));
    expect(afterSecondTouch?.touchedAt).toEqual(firstTouchedAt);
  });
});

interface SeedCycleAndEventInput {
  seed: Awaited<ReturnType<typeof seedSchedulingPhase3Base>>;
  ministryId?: string;
  churchId?: string;
  state?: 'draft' | 'locked' | 'archived';
}

async function seedCycleAndEvent({
  seed,
  ministryId,
  churchId,
  state,
}: SeedCycleAndEventInput) {
  const targetChurchId = churchId ?? seed.churchAId;
  const cycle = await createSchedulingPhase3Cycle({
    churchId: targetChurchId,
    name: `Cycle-${Math.random().toString(36).slice(2, 8)}`,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-09-01T00:00:00.000Z'),
    state: state ?? 'locked',
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId: targetChurchId,
    cycleId: cycle.id,
    ministryId: ministryId ?? seed.ministryAId,
    title: 'Sunday Service',
    startDate: new Date('2026-08-02T12:00:00.000Z'),
    endDate: new Date('2026-08-02T15:00:00.000Z'),
    status: 'scheduled',
  });

  return { cycle, ...graph };
}

describe('DrizzleMinistryParticipationRepository.listMinistryCycleSummaries (Iteration 3, T063/T063a)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('returns isPartOf: false with 0 counts, not_started status, and availabilityFiredForAll: false for a locked cycle the ministry has zero events in — never vacuously true', async () => {
    const seed = await seedSchedulingPhase3Base();
    // Locked cycle with no events for ministryA at all.
    await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Untouched Cycle',
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-11-01T00:00:00.000Z'),
      state: 'locked',
    });
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    const rows = await repo.listMinistryCycleSummaries({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Untouched Cycle',
      isPartOf: false,
      eventCount: 0,
      slotCount: 0,
      status: 'not_started',
      availabilityFiredForAll: false,
    });
  });

  it('excludes cycles not in the locked state', async () => {
    const seed = await seedSchedulingPhase3Base();
    await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Draft Cycle',
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-11-01T00:00:00.000Z'),
      state: 'draft',
    });
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    const rows = await repo.listMinistryCycleSummaries({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
    });

    expect(rows).toHaveLength(0);
  });

  it('reads not_started when the ministry has events but none are touched', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycle } = await seedCycleAndEvent({ seed });
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    const rows = await repo.listMinistryCycleSummaries({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
    });

    const row = rows.find((r) => r.cycleId === cycle.id);
    expect(row).toMatchObject({
      isPartOf: true,
      eventCount: 1,
      status: 'not_started',
      availabilityFiredForAll: false,
    });
  });

  it('reads in_progress when the ministry has touched some but not all of its events in the cycle', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Mixed Cycle',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
      state: 'locked',
    });
    const graphA = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Event A',
      startDate: new Date('2026-08-02T12:00:00.000Z'),
      endDate: new Date('2026-08-02T15:00:00.000Z'),
    });
    await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Event B',
      startDate: new Date('2026-08-03T12:00:00.000Z'),
      endDate: new Date('2026-08-03T15:00:00.000Z'),
    });
    await schedulingTestDb
      .update(ministryParticipation)
      .set({ touchedAt: new Date() })
      .where(eq(ministryParticipation.id, graphA.participation.id));
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    const rows = await repo.listMinistryCycleSummaries({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
    });

    const row = rows.find((r) => r.cycleId === cycle.id);
    expect(row).toMatchObject({
      eventCount: 2,
      status: 'in_progress',
      availabilityFiredForAll: false,
    });
  });

  it("sums slotCount across every ParticipationSlotInclusion row across every event the ministry participates in for the cycle, not the events' total slot count", async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Multi-Slot Cycle',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
      state: 'locked',
    });
    const graphA = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Event A',
      startDate: new Date('2026-08-02T12:00:00.000Z'),
      endDate: new Date('2026-08-02T15:00:00.000Z'),
    });
    const graphB = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Event B',
      startDate: new Date('2026-08-03T12:00:00.000Z'),
      endDate: new Date('2026-08-03T15:00:00.000Z'),
    });
    // Event A's participation includes its one slot; Event B's participation
    // is untouched (no inclusion row) — slotCount must sum only included
    // slots across both events (1), not the events' combined slot count (2).
    await schedulingTestDb.insert(participationSlotInclusion).values({
      churchId: seed.churchAId,
      participationId: graphA.participation.id,
      timeSlotId: graphA.slot.id,
    });
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    const rows = await repo.listMinistryCycleSummaries({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
    });

    const row = rows.find((r) => r.cycleId === cycle.id);
    expect(row).toMatchObject({ eventCount: 2, slotCount: 1 });

    // Now include Event B's slot too — slotCount must sum to 2.
    await schedulingTestDb.insert(participationSlotInclusion).values({
      churchId: seed.churchAId,
      participationId: graphB.participation.id,
      timeSlotId: graphB.slot.id,
    });

    const rowsAfter = await repo.listMinistryCycleSummaries({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
    });
    const rowAfter = rowsAfter.find((r) => r.cycleId === cycle.id);
    expect(rowAfter).toMatchObject({ eventCount: 2, slotCount: 2 });
  });

  it('reads published only when every participation in the cycle is published, and availabilityFiredForAll independently of that boundary', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Finished Cycle',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
      state: 'locked',
    });
    const { participation } = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Event A',
      startDate: new Date('2026-08-02T12:00:00.000Z'),
      endDate: new Date('2026-08-02T15:00:00.000Z'),
    });
    await schedulingTestDb
      .update(ministryParticipation)
      .set({ touchedAt: new Date(), state: 'published' })
      .where(eq(ministryParticipation.id, participation.id));
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    const rows = await repo.listMinistryCycleSummaries({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
    });

    const row = rows.find((r) => r.cycleId === cycle.id);
    expect(row).toMatchObject({
      eventCount: 1,
      status: 'published',
      availabilityFiredForAll: true,
    });
  });

  it('availabilityFiredForAny is true once any participation has fired even while availabilityFiredForAll stays false, and false for a zero-event cycle (R6 vacuous-truth guard)', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Partially Fired Cycle',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
      state: 'locked',
    });
    const firedGraph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Fired Event',
      startDate: new Date('2026-08-02T12:00:00.000Z'),
      endDate: new Date('2026-08-02T15:00:00.000Z'),
    });
    await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Untouched Event',
      startDate: new Date('2026-08-03T12:00:00.000Z'),
      endDate: new Date('2026-08-03T15:00:00.000Z'),
    });
    // Fire exactly one of the two participations.
    await schedulingTestDb
      .update(ministryParticipation)
      .set({ touchedAt: new Date(), state: 'availability_fired' })
      .where(eq(ministryParticipation.id, firedGraph.participation.id));
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    const rows = await repo.listMinistryCycleSummaries({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
    });
    const row = rows.find((r) => r.cycleId === cycle.id);
    expect(row).toMatchObject({
      eventCount: 2,
      availabilityFiredForAll: false,
      availabilityFiredForAny: true,
    });

    // A cycle the ministry has zero events in must never be vacuously true.
    await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Empty Cycle',
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-11-01T00:00:00.000Z'),
      state: 'locked',
    });
    const rowsAfter = await repo.listMinistryCycleSummaries({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
    });
    const emptyRow = rowsAfter.find((r) => r.name === 'Empty Cycle');
    expect(emptyRow).toMatchObject({
      eventCount: 0,
      availabilityFiredForAny: false,
    });
  });

  it('church isolation: a query for church B never sees church A cycles/participations (Spec R2 §4)', async () => {
    const seed = await seedSchedulingPhase3Base();
    await seedCycleAndEvent({ seed, state: 'locked' });
    const repo = new DrizzleMinistryParticipationRepository(schedulingTestDb);

    const churchBRows = await repo.listMinistryCycleSummaries({
      churchId: ChurchId.from(seed.churchBId),
      ministryId: MinistryId.from(seed.ministryBId),
    });

    expect(churchBRows).toEqual([]);
  });
});
