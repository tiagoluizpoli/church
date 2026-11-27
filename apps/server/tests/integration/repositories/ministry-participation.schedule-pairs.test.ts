import { scheduleLastTold } from '@church/db';
import { parseInstant } from '@church/time';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, CycleId, MinistryId } from '@/domain/branded-ids';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { buildMinistry } from '@/seeds/builders/ministry';
import {
  buildEvent,
  buildMinistryParticipation,
} from '@/seeds/builders/scheduling';
import {
  createSchedulingPhase3Cycle,
  schedulingTestDb as db,
  resetSchedulingPhase3Db,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

const repository = new DrizzleMinistryParticipationRepository({ db });

beforeEach(async () => {
  await resetSchedulingPhase3Db();
});

/** Two Ministries, each with a published and told Schedule in two Cycles. */
async function seedTwoByTwo() {
  const seed = await seedSchedulingPhase3Base();
  const churchId = seed.churchAId;
  const other = await buildMinistry({ db, churchId, name: 'Other Ministry' });
  const ministryIds = [seed.ministryAId, other.id];
  const cycleIds: string[] = [];
  for (const month of ['08', '09']) {
    const cycle = await createSchedulingPhase3Cycle({
      churchId,
      name: `Cycle ${month}`,
      startDate: new Date(`2026-${month}-01T00:00:00.000Z`),
      endDate: new Date(`2026-${month}-28T00:00:00.000Z`),
    });
    cycleIds.push(cycle.id);
    const event = await buildEvent({
      db,
      churchId,
      cycleId: cycle.id,
      title: 'Service',
      start: parseInstant({ value: `2026-${month}-02T09:00:00Z` }),
      end: parseInstant({ value: `2026-${month}-02T11:00:00Z` }),
      status: 'scheduled',
    });
    for (const ministryId of ministryIds) {
      await buildMinistryParticipation({
        db,
        churchId,
        ministryId,
        eventId: event.id,
        state: 'published',
        eventTimeBlockIds: [],
      });
      await db.insert(scheduleLastTold).values({
        churchId,
        ministryId,
        cycleId: cycle.id,
        volunteerId: seed.adminVolunteerId,
        assignments: [],
      });
    }
  }
  const [ministryA, ministryB] = ministryIds.map((id) => MinistryId.from(id));
  const [first, second] = cycleIds.map((id) => CycleId.from(id));
  if (!ministryA || !ministryB || !first || !second)
    throw new Error('two Ministries and two Cycles needed');
  return {
    churchId: ChurchId.from(churchId),
    // The diagonal of the 2×2: the other two pairs must not be read.
    schedules: [
      { ministryId: ministryA, cycleId: first },
      { ministryId: ministryB, cycleId: second },
    ],
  };
}

const pairsOf = (rows: { ministryId: string; cycleId: string }[]) =>
  rows.map(({ ministryId, cycleId }) => `${ministryId}:${cycleId}`).sort();

describe('Schedule facts reads select the asked Ministry × Cycle pairs only', () => {
  it('listPublishedScheduleParticipations', async () => {
    const { churchId, schedules } = await seedTwoByTwo();

    const rows = await repository.listPublishedScheduleParticipations({
      churchId,
      schedules,
    });

    const read = rows.map(({ participation, event }) => ({
      ministryId: participation.ministryId,
      cycleId: event.cycleId,
    }));
    expect(pairsOf(read)).toEqual(pairsOf(schedules));
  });

  it('listScheduleLastToldBySchedules', async () => {
    const { churchId, schedules } = await seedTwoByTwo();

    const rows = await repository.listScheduleLastToldBySchedules({
      churchId,
      schedules,
    });

    expect(pairsOf(rows)).toEqual(pairsOf(schedules));
  });

  it('reads nothing when no Schedule is asked for', async () => {
    const { churchId } = await seedTwoByTwo();
    const none = { churchId, schedules: [] };

    expect(await repository.listPublishedScheduleParticipations(none)).toEqual(
      [],
    );
    expect(await repository.listScheduleLastToldBySchedules(none)).toEqual([]);
  });
});
