import {
  addCalendarDays,
  type CalendarDay,
  parseTimeOfDay,
  type TimeOfDay,
} from '@church/time';
import {
  buildAssignment,
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  buildShift,
  buildShiftRequirement,
} from '../../builders/scheduling';
import type { SeedRecipeLoadInput } from '../../recipe';
import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  journeyIdentity,
} from '../journey-keys';
import type { E2eJourneyRecipe } from '../journey-recipe';
import {
  type AssignChurch,
  type AssignChurchPlan,
  anchoredInstant,
  assignChurchRootKinds,
  buildAssignChurch,
  EVENT_END_TIME,
  EVENT_START_TIME,
} from './assign-church';
import type { AssignCycleSummary } from './assign-event';

/**
 * A screenshot scenario (#1169), not a journey: a sent, published Cycle with
 * a Shift that started at the anchor day's midnight (assigned) and, a week
 * later, an Event with one active and one cancelled EventTimeBlock.
 */
const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.cancelledAndStarted;
const CYCLE_LENGTH_DAYS = 28;
const LATER_EVENT_OFFSET_DAYS = 7;
const PEOPLE_NEEDED = 2;
const DAY_START_TIME = parseTimeOfDay({ value: '00:00' });
const DAY_END_TIME = parseTimeOfDay({ value: '23:59' });
const EVENING_START_TIME = parseTimeOfDay({ value: '19:00' });
const EVENING_END_TIME = parseTimeOfDay({ value: '21:00' });

const PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Recepcionista' },
      sectors: { main: 'Principal' },
    },
  },
  personas: {
    admin: { name: 'Lia Prado', churchAccessLevel: 'admin', memberships: [] },
    leader: {
      name: 'Marina Costa',
      churchAccessLevel: 'member',
      memberships: [{ ministry: 'worship', accessLevel: 'leader', roles: [] }],
    },
    volunteer: {
      name: 'Rafael Moura',
      churchAccessLevel: 'member',
      memberships: [
        { ministry: 'worship', accessLevel: 'volunteer', roles: ['usher'] },
      ],
    },
  },
  pool: {},
} as const satisfies AssignChurchPlan;

interface BlockPlan {
  key: string;
  label: string;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  status: 'active' | 'cancelled';
}

interface EventPlan {
  key: string;
  title: string;
  /** Days after the anchor. */
  dayOffset: number;
  blocks: readonly BlockPlan[];
}

const STARTED_EVENT: EventPlan = {
  key: 'vigil',
  title: 'Vigília de Oração',
  dayOffset: 0,
  blocks: [
    {
      key: 'vigil',
      label: 'Vigília',
      startTime: DAY_START_TIME,
      endTime: DAY_END_TIME,
      status: 'active',
    },
  ],
};

const LATER_EVENT: EventPlan = {
  key: 'sunday',
  title: 'Culto de Domingo',
  dayOffset: LATER_EVENT_OFFSET_DAYS,
  blocks: [
    {
      key: 'morning',
      label: 'Manhã',
      startTime: EVENT_START_TIME,
      endTime: EVENT_END_TIME,
      status: 'active',
    },
    {
      key: 'evening',
      label: 'Noite',
      startTime: EVENING_START_TIME,
      endTime: EVENING_END_TIME,
      status: 'cancelled',
    },
  ],
};

export interface CancelledAndStartedScenario extends AssignChurch<typeof PLAN> {
  anchor: CalendarDay;
  cycle: AssignCycleSummary;
  startedShiftId: string;
  activeShiftId: string;
  cancelledShiftId: string;
}

export function createCancelledAndStartedRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<CancelledAndStartedScenario> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<CancelledAndStartedScenario> {
    const base = await buildAssignChurch({ db, idOf, tag, plan: PLAN });
    const churchId = base.church.id;
    const { worship } = base.ministries;
    const cycle = await buildCycle({
      db,
      churchId,
      id: idOf({ kind: 'cycle' }),
      name: 'Ciclo em Andamento',
      startDate: anchor,
      endDate: addCalendarDays({ day: anchor, days: CYCLE_LENGTH_DAYS - 1 }),
      state: 'sent',
    });

    /** One published Event; each block carries one Shift and its seat. */
    async function buildPublishedEvent(plan: EventPlan) {
      const blocks = plan.blocks.map((block) => ({
        ...block,
        id: idOf({ kind: `event-time-block:${block.key}` }),
        start: anchoredInstant({
          anchor,
          dayOffset: plan.dayOffset,
          time: block.startTime,
        }),
        end: anchoredInstant({
          anchor,
          dayOffset: plan.dayOffset,
          time: block.endTime,
        }),
      }));
      const starts = blocks.map((block) => block.start).sort();
      const ends = blocks.map((block) => block.end).sort();
      const [start] = starts;
      const end = ends.at(-1);
      if (!start || !end) throw new Error(`${plan.title} has no blocks.`);

      const event = await buildEvent({
        db,
        churchId,
        cycleId: cycle.id,
        id: idOf({ kind: `event:${plan.key}` }),
        title: plan.title,
        start,
        end,
        status: 'scheduled',
      });
      for (const block of blocks) {
        await buildEventTimeBlock({
          db,
          churchId,
          eventId: event.id,
          id: block.id,
          start: block.start,
          end: block.end,
          label: block.label,
          status: block.status,
        });
      }
      const participation = await buildMinistryParticipation({
        db,
        churchId,
        ministryId: worship.id,
        eventId: event.id,
        id: idOf({ kind: `participation:${plan.key}` }),
        state: 'published',
        eventTimeBlockIds: blocks.map((block) => block.id),
      });

      const seats = [];
      for (const block of blocks) {
        const shift = await buildShift({
          db,
          churchId,
          participationId: participation.id,
          eventTimeBlockId: block.id,
          id: idOf({ kind: `shift:${block.key}` }),
          start: block.start,
          end: block.end,
        });
        const requirement = await buildShiftRequirement({
          db,
          churchId,
          participationId: participation.id,
          shiftId: shift.id,
          roleId: worship.roles.usher.id,
          id: idOf({ kind: `shift-requirement:${block.key}` }),
          peopleNeeded: PEOPLE_NEEDED,
          sectorId: worship.sectors.main.id,
        });
        seats.push({
          participationId: participation.id,
          shiftId: shift.id,
          shiftRequirementId: requirement.id,
        });
      }
      return seats;
    }

    const [started] = await buildPublishedEvent(STARTED_EVENT);
    const [active, cancelled] = await buildPublishedEvent(LATER_EVENT);
    if (!started || !active || !cancelled) {
      throw new Error('The scenario plan lost a block.');
    }
    await buildAssignment({
      db,
      churchId,
      ...started,
      volunteerId: base.personas.volunteer.volunteerId,
      roleId: worship.roles.usher.id,
      id: idOf({ kind: 'assignment' }),
      status: 'pending',
    });

    return {
      anchor,
      ...base,
      cycle: { id: cycle.id, name: cycle.name },
      startedShiftId: started.shiftId,
      activeShiftId: active.shiftId,
      cancelledShiftId: cancelled.shiftId,
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: assignChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}
