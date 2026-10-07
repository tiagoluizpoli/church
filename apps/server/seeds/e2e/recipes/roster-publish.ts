import { addCalendarDays, type CalendarDay, type Instant } from '@church/time';
import {
  buildEvent,
  buildMinistryParticipation,
  buildPlanningCycle,
  buildShift,
  buildSlotRequirement,
  buildTimeSlot,
} from '../../builders/scheduling';
import type { SeedRecipeLoadInput } from '../../recipe';
import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  journeyIdentity,
} from '../journey-keys';
import type { E2eJourneyRecipe } from '../journey-recipe';
import {
  anchoredInstant,
  buildRosteringChurch,
  EVENT_END_TIME,
  EVENT_START_TIME,
  type RosteringChurch,
  type RosteringChurchPlan,
  rosteringChurchRootKinds,
} from './rostering-church';
import type { RosteringCycleSummary } from './rostering-event';

/**
 * The starting graph of the roster-and-publish journey (#329): a locked
 * Planning Cycle with one event both Ministries take part in, each at
 * `availability_fired`. Publishing is cycle-wide, so the cycle (and both
 * Participations) belong to this journey alone. The worship Ministry needs
 * two Ushers; one qualified Volunteer persona and one pool Volunteer are
 * candidates, so assigning "by name" is a real choice.
 */

/* Own Event/TimeSlot builder, not `buildRosteringEvent`: both Ministries take
 * part in ONE Event and TimeSlot (publish is cycle-wide, so the sibling must
 * share the cycle and event), which that builder's one-Participation-per-Event
 * shape cannot express without a signature change. */
const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.rosterPublish;
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
} as const satisfies RosteringChurchPlan;

type RosterPublishChurch = RosteringChurch<typeof PLAN>;

export interface RosterPublishParticipation {
  id: string;
  shiftId: string;
}

export interface RosterPublishEvent {
  id: string;
  title: string;
  startsAt: Instant;
}

export interface RosterPublishWorshipParticipation
  extends RosterPublishParticipation {
  requiredCount: number;
}

export interface RosterPublishJourney extends RosterPublishChurch {
  anchor: CalendarDay;
  cycle: RosteringCycleSummary;
  event: RosterPublishEvent;
  /** Worship starts with `requiredCount` Ushers open; care stays unpublished. */
  worship: RosterPublishWorshipParticipation;
  care: RosterPublishParticipation;
}

interface MinistryRosterInput {
  key: string;
  ministryId: string;
  roleId: string;
  requiredCount: number;
  teamId?: string;
}

export function createRosterPublishRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<RosterPublishJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<RosterPublishJourney> {
    const base = await buildRosteringChurch({ db, idOf, tag, plan: PLAN });
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
    const cycle = await buildPlanningCycle({
      db,
      churchId,
      id: idOf({ kind: 'planning-cycle' }),
      name: 'Ciclo de Publicação',
      startDate: anchor,
      endDate: addCalendarDays({ day: anchor, days: CYCLE_LENGTH_DAYS }),
      state: 'locked',
    });
    const event = await buildEvent({
      db,
      churchId,
      planningCycleId: cycle.id,
      id: idOf({ kind: 'event' }),
      title: 'Culto de Publicação',
      start: startsAt,
      end: endsAt,
      status: 'draft',
      eventType: 'hourly',
    });
    const timeSlot = await buildTimeSlot({
      db,
      churchId,
      eventId: event.id,
      id: idOf({ kind: 'time-slot' }),
      start: startsAt,
      end: endsAt,
    });

    async function buildMinistryRoster({
      key,
      ministryId,
      roleId,
      requiredCount,
      teamId,
    }: MinistryRosterInput): Promise<RosterPublishParticipation> {
      const participation = await buildMinistryParticipation({
        db,
        churchId,
        ministryId,
        eventId: event.id,
        id: idOf({ kind: `participation:${key}` }),
        state: 'availability_fired',
        timeSlotIds: [timeSlot.id],
      });
      const shift = await buildShift({
        db,
        churchId,
        participationId: participation.id,
        timeSlotId: timeSlot.id,
        id: idOf({ kind: `shift:${key}` }),
        start: startsAt,
        end: endsAt,
      });
      await buildSlotRequirement({
        db,
        churchId,
        participationId: participation.id,
        shiftId: shift.id,
        roleId,
        id: idOf({ kind: `slot-requirement:${key}` }),
        requiredCount,
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
        ...(await buildMinistryRoster({
          key: 'worship',
          ministryId: worship.id,
          roleId: worship.roles.usher.id,
          requiredCount: USHERS_REQUIRED,
        })),
        requiredCount: USHERS_REQUIRED,
      },
      care: await buildMinistryRoster({
        key: 'care',
        ministryId: care.id,
        roleId: care.roles.careHost.id,
        requiredCount: 1,
        teamId: care.teams.care.id,
      }),
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: rosteringChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}
