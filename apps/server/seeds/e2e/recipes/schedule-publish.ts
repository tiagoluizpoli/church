import { addCalendarDays, type CalendarDay, type Instant } from '@church/time';
import {
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
 * The starting graph of the schedule-and-publish journey (#329): a sent
 * Cycle with one event both Ministries take part in, each at
 * `availability_requested`. Publishing is cycle-wide, so the cycle (and both
 * Participations) belong to this journey alone. The worship Ministry needs
 * two Ushers; one qualified Volunteer persona and one pool Volunteer are
 * candidates, so assigning "by name" is a real choice.
 */

/* Own Event/EventTimeBlock builder, not `buildAssignEvent`: both Ministries take
 * part in ONE Event and EventTimeBlock (publish is cycle-wide, so the sibling must
 * share the cycle and event), which that builder's one-Participation-per-Event
 * shape cannot express without a signature change. */
const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.schedulePublish;
const CYCLE_LENGTH_DAYS = 28;
const EVENT_OFFSET_DAYS = 14;
const USHERS_REQUIRED = 2;

const PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Recepcionista' },
      teams: {},
    },
    care: {
      name: 'Cuidado',
      roles: { careHost: 'Anfitrião' },
      teams: { care: 'Equipe Cuidado' },
    },
  },
  personas: {
    leader: {
      name: 'Lia Prado',
      churchAccessLevel: 'admin',
      memberships: [
        { ministry: 'worship', accessLevel: 'leader', roles: [], teams: [] },
        { ministry: 'care', accessLevel: 'leader', roles: [], teams: [] },
      ],
    },
    volunteer: {
      name: 'Rafael Moura',
      churchAccessLevel: 'member',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: ['usher'],
          teams: [],
        },
      ],
    },
  },
  pool: {
    other: {
      name: 'Beatriz Campos',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: ['usher'],
          teams: [],
        },
      ],
    },
  },
} as const satisfies AssignChurchPlan;

type SchedulePublishChurch = AssignChurch<typeof PLAN>;

export interface SchedulePublishParticipation {
  id: string;
  shiftId: string;
}

export interface SchedulePublishEvent {
  id: string;
  title: string;
  startsAt: Instant;
}

export interface SchedulePublishWorshipParticipation
  extends SchedulePublishParticipation {
  peopleNeeded: number;
}

export interface SchedulePublishJourney extends SchedulePublishChurch {
  anchor: CalendarDay;
  cycle: AssignCycleSummary;
  event: SchedulePublishEvent;
  /** Worship starts with `peopleNeeded` Ushers open; care stays unpublished. */
  worship: SchedulePublishWorshipParticipation;
  care: SchedulePublishParticipation;
}

interface MinistryScheduleInput {
  key: string;
  ministryId: string;
  roleId: string;
  peopleNeeded: number;
  teamId?: string;
}

export function createSchedulePublishRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<SchedulePublishJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<SchedulePublishJourney> {
    const base = await buildAssignChurch({ db, idOf, tag, plan: PLAN });
    const churchId = base.church.id;
    const { worship, care } = base.ministries;

    const startsAt = anchoredInstant({
      anchor,
      dayOffset: EVENT_OFFSET_DAYS,
      time: EVENT_START_TIME,
    });
    const endsAt = anchoredInstant({
      anchor,
      dayOffset: EVENT_OFFSET_DAYS,
      time: EVENT_END_TIME,
    });
    const cycle = await buildCycle({
      db,
      churchId,
      id: idOf({ kind: 'cycle' }),
      name: 'Ciclo de Publicação',
      startDate: anchor,
      endDate: addCalendarDays({ day: anchor, days: CYCLE_LENGTH_DAYS }),
      state: 'sent',
    });
    const event = await buildEvent({
      db,
      churchId,
      cycleId: cycle.id,
      id: idOf({ kind: 'event' }),
      title: 'Culto de Publicação',
      start: startsAt,
      end: endsAt,
      status: 'draft',
    });
    const eventTimeBlock = await buildEventTimeBlock({
      db,
      churchId,
      eventId: event.id,
      id: idOf({ kind: 'event-time-block' }),
      start: startsAt,
      end: endsAt,
    });

    async function buildMinistrySchedule({
      key,
      ministryId,
      roleId,
      peopleNeeded,
      teamId,
    }: MinistryScheduleInput): Promise<SchedulePublishParticipation> {
      const participation = await buildMinistryParticipation({
        db,
        churchId,
        ministryId,
        eventId: event.id,
        id: idOf({ kind: `participation:${key}` }),
        state: 'availability_requested',
        eventTimeBlockIds: [eventTimeBlock.id],
      });
      const shift = await buildShift({
        db,
        churchId,
        participationId: participation.id,
        eventTimeBlockId: eventTimeBlock.id,
        id: idOf({ kind: `shift:${key}` }),
        start: startsAt,
        end: endsAt,
      });
      await buildShiftRequirement({
        db,
        churchId,
        participationId: participation.id,
        shiftId: shift.id,
        roleId,
        id: idOf({ kind: `shift-requirement:${key}` }),
        peopleNeeded,
        teamId,
      });
      return { id: participation.id, shiftId: shift.id };
    }

    return {
      anchor,
      ...base,
      cycle: { id: cycle.id, name: cycle.name },
      event: { id: event.id, title: event.title, startsAt },
      worship: {
        ...(await buildMinistrySchedule({
          key: 'worship',
          ministryId: worship.id,
          roleId: worship.roles.usher.id,
          peopleNeeded: USHERS_REQUIRED,
        })),
        peopleNeeded: USHERS_REQUIRED,
      },
      care: await buildMinistrySchedule({
        key: 'care',
        ministryId: care.id,
        roleId: care.roles.careHost.id,
        peopleNeeded: 1,
        teamId: care.teams.care.id,
      }),
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: assignChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}
