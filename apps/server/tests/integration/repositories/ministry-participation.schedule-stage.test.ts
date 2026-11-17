import { parseInstant } from '@church/time';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId } from '@/domain/branded-ids';
import {
  deriveScheduleStage,
  PARTICIPATION_STATE_OPTIONS,
  type ParticipationState,
} from '@/domain/entities/ministry-participation';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { buildMinistry } from '@/seeds/builders/ministry';
import {
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
} from '@/seeds/builders/scheduling';
import {
  createSchedulingPhase3Cycle,
  schedulingTestDb as db,
  resetSchedulingPhase3Db,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

/** Every subset of the serving states, the empty one included. */
const COMBINATIONS: ParticipationState[][] = Array.from(
  { length: 2 ** PARTICIPATION_STATE_OPTIONS.length },
  (_, mask) =>
    PARTICIPATION_STATE_OPTIONS.filter((_, bit) => (mask >> bit) & 1),
);

beforeEach(async () => {
  await resetSchedulingPhase3Db();
});

describe('Schedule stage in SQL', () => {
  // The list query buckets, filters and pages by a SQL stage; it must agree with the domain rule.
  it('equals deriveScheduleStage for every combination of serving states', async () => {
    const { churchAId: churchId } = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId,
      name: 'October 2026',
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-10-31T00:00:00.000Z'),
      state: 'sent',
    });
    const expected = new Map<string, string>();
    for (const [index, states] of COMBINATIONS.entries()) {
      const name = `Combination ${String(index).padStart(2, '0')}`;
      const combination = await buildMinistry({ db, churchId, name });
      for (const [day, state] of states.entries()) {
        const start = parseInstant({
          value: `2026-10-0${day + 1}T12:00:00.000Z`,
        });
        const end = parseInstant({
          value: `2026-10-0${day + 1}T14:00:00.000Z`,
        });
        const planningEvent = await buildEvent({
          db,
          churchId,
          cycleId: cycle.id,
          title: `${name} ${state}`,
          status: 'scheduled',
          start,
          end,
        });
        const block = await buildEventTimeBlock({
          db,
          churchId,
          eventId: planningEvent.id,
          start,
          end,
        });
        await buildMinistryParticipation({
          db,
          churchId,
          ministryId: combination.id,
          eventId: planningEvent.id,
          state,
          eventTimeBlockIds: [block.id],
        });
      }
      expected.set(name, deriveScheduleStage({ servingStates: states }));
    }

    const { rows } = await new DrizzleMinistryParticipationRepository({
      db,
    }).listScheduleRows({
      churchId: ChurchId.from(churchId),
      cycleStates: ['sent'],
      limit: 50,
    });

    const actual = new Map(
      rows
        .filter(({ ministry }) => expected.has(ministry.name))
        .map(({ ministry, stage }) => [ministry.name, stage]),
    );
    expect(actual).toEqual(expected);
  });
});
