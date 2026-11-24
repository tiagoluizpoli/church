import { addCalendarDays, type CalendarDay, type Instant } from '@church/time';
import {
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  buildShift,
  buildShiftRequirement,
} from '../../builders/scheduling';
import {
  buildAvailabilityCheck,
  buildConfirmedAvailabilityCheck,
  buildUnavailableShift,
} from '../../builders/unavailable-shift';
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
  personaUserKind,
  poolUserKind,
} from './assign-church';
import type { AssignCycleSummary } from './assign-event';

/**
 * The starting graph of the schedule-and-publish journey (#329): a sent
 * Cycle with one event both Ministries take part in, each at
 * `availability_requested`. Publishing is cycle-wide, so the cycle (and both
 * Participations) belong to this journey alone. The worship Ministry needs
 * two Ushers; one qualified Volunteer persona and one pool Volunteer are
 * candidates, so assigning "by name" is a real choice. Only the Volunteer
 * persona has confirmed availability, so an Assignment proposal suggests
 * exactly that persona and leaves one Usher place open (#873).
 *
 * A second worship Event gives the proposal real choices (#952). Availability:
 * - Rafael (persona): confirmed, free for both Shifts.
 * - Elisa: confirmed, unavailable for the second Shift, so she is the scarcest.
 * - Davi: confirmed, unavailable for both Shifts.
 * - Caio: check still pending. Beatriz (persona) has no answer at all.
 * The proposal is therefore Elisa and Rafael on the first Shift, Rafael on the
 * second, and one open place left on the second.
 */

/* Own Event/EventTimeBlock builder, not `buildAssignEvent`: both Ministries take
 * part in ONE Event and EventTimeBlock (publish is cycle-wide, so the sibling must
 * share the cycle and event), which that builder's one-Participation-per-Event
 * shape cannot express without a signature change. */
const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.schedulePublish;
const CYCLE_LENGTH_DAYS = 28;
const EVENT_OFFSET_DAYS = 14;
const USHERS_REQUIRED = 2;
const SECOND_EVENT_OFFSET_DAYS = 15;
const SECOND_USHERS_REQUIRED = 2;
const worshipUsher = (ministry: 'worship') =>
  ({ ministry, accessLevel: 'volunteer', roles: ['usher'] }) as const;

const PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Recepcionista' },
      sectors: { main: 'Principal' },
    },
    care: {
      name: 'Cuidado',
      roles: { careHost: 'Anfitrião' },
      sectors: { main: 'Principal' },
    },
  },
  personas: {
    leader: {
      name: 'Lia Prado',
      churchAccessLevel: 'admin',
      memberships: [
        { ministry: 'worship', accessLevel: 'leader', roles: [] },
        { ministry: 'care', accessLevel: 'leader', roles: [] },
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
        },
      ],
    },
    other: {
      name: 'Beatriz Campos',
      churchAccessLevel: 'member',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: ['usher'],
        },
      ],
    },
  },
  pool: {
    elisa: { name: 'Elisa Nunes', memberships: [worshipUsher('worship')] },
    davi: { name: 'Davi Teles', memberships: [worshipUsher('worship')] },
    caio: { name: 'Caio Duarte', memberships: [worshipUsher('worship')] },
  },
} as const satisfies AssignChurchPlan;

type SchedulePublishChurch = AssignChurch<typeof PLAN>;

export interface SchedulePublishParticipation {
  id: string;
  shiftId: string;
  requirementId: string;
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
  /** A later worship Event of the same Cycle, with its own Shift. */
  worshipSecond: SchedulePublishWorshipParticipation & {
    event: SchedulePublishEvent;
  };
  care: SchedulePublishParticipation;
}

interface MinistryScheduleInput {
  key: string;
  event: { id: string };
  eventTimeBlockId: string;
  startsAt: Instant;
  endsAt: Instant;
  ministryId: string;
  roleId: string;
  peopleNeeded: number;
  sectorId: string;
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
      // The last of CYCLE_LENGTH_DAYS included days.
      endDate: addCalendarDays({ day: anchor, days: CYCLE_LENGTH_DAYS - 1 }),
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
    const secondStartsAt = anchoredInstant({
      anchor,
      dayOffset: SECOND_EVENT_OFFSET_DAYS,
      time: EVENT_START_TIME,
    });
    const secondEndsAt = anchoredInstant({
      anchor,
      dayOffset: SECOND_EVENT_OFFSET_DAYS,
      time: EVENT_END_TIME,
    });
    const secondEvent = await buildEvent({
      db,
      churchId,
      cycleId: cycle.id,
      id: idOf({ kind: 'event:second' }),
      title: 'Culto de Domingo Seguinte',
      start: secondStartsAt,
      end: secondEndsAt,
      status: 'draft',
    });
    const secondEventTimeBlock = await buildEventTimeBlock({
      db,
      churchId,
      eventId: secondEvent.id,
      id: idOf({ kind: 'event-time-block:second' }),
      start: secondStartsAt,
      end: secondEndsAt,
    });

    async function buildMinistrySchedule({
      key,
      event,
      eventTimeBlockId,
      startsAt,
      endsAt,
      ministryId,
      roleId,
      peopleNeeded,
      sectorId,
    }: MinistryScheduleInput): Promise<SchedulePublishParticipation> {
      const participation = await buildMinistryParticipation({
        db,
        churchId,
        ministryId,
        eventId: event.id,
        id: idOf({ kind: `participation:${key}` }),
        state: 'availability_requested',
        eventTimeBlockIds: [eventTimeBlockId],
      });
      const shift = await buildShift({
        db,
        churchId,
        participationId: participation.id,
        eventTimeBlockId,
        id: idOf({ kind: `shift:${key}` }),
        start: startsAt,
        end: endsAt,
      });
      const requirement = await buildShiftRequirement({
        db,
        churchId,
        participationId: participation.id,
        shiftId: shift.id,
        roleId,
        id: idOf({ kind: `shift-requirement:${key}` }),
        peopleNeeded,
        sectorId,
      });
      return {
        id: participation.id,
        shiftId: shift.id,
        requirementId: requirement.id,
      };
    }

    const worshipSchedule = {
      ...(await buildMinistrySchedule({
        key: 'worship',
        event,
        eventTimeBlockId: eventTimeBlock.id,
        startsAt,
        endsAt,
        ministryId: worship.id,
        roleId: worship.roles.usher.id,
        sectorId: worship.sectors.main.id,
        peopleNeeded: USHERS_REQUIRED,
      })),
      peopleNeeded: USHERS_REQUIRED,
    };
    const worshipSecond = {
      ...(await buildMinistrySchedule({
        key: 'worship-second',
        event: secondEvent,
        eventTimeBlockId: secondEventTimeBlock.id,
        startsAt: secondStartsAt,
        endsAt: secondEndsAt,
        ministryId: worship.id,
        roleId: worship.roles.usher.id,
        sectorId: worship.sectors.main.id,
        peopleNeeded: SECOND_USHERS_REQUIRED,
      })),
      peopleNeeded: SECOND_USHERS_REQUIRED,
      event: {
        id: secondEvent.id,
        title: secondEvent.title,
        startsAt: secondStartsAt,
      },
    };
    const careSchedule = await buildMinistrySchedule({
      key: 'care',
      event,
      eventTimeBlockId: eventTimeBlock.id,
      startsAt,
      endsAt,
      ministryId: care.id,
      roleId: care.roles.careHost.id,
      peopleNeeded: 1,
      sectorId: care.sectors.main.id,
    });

    const worshipShifts = {
      first: idOf({ kind: 'shift:worship' }),
      second: idOf({ kind: 'shift:worship-second' }),
    };
    const confirmedAt = anchoredInstant({
      anchor,
      dayOffset: 0,
      time: EVENT_START_TIME,
    });
    const membershipIdOf = ({ userKind }: { userKind: string }) =>
      idOf({ kind: `ministry-membership:${userKind}:worship` });
    const confirm = async ({
      key,
      userKind,
      unavailable,
    }: {
      key: string;
      userKind: string;
      unavailable: string[];
    }) => {
      const check = await buildConfirmedAvailabilityCheck({
        db,
        churchId,
        cycleId: cycle.id,
        ministryMembershipId: membershipIdOf({ userKind }),
        id: idOf({ kind: `availability-check:${key}` }),
        confirmedAt,
      });
      for (const shiftId of unavailable) {
        await buildUnavailableShift({
          db,
          churchId,
          availabilityCheckId: check.id,
          shiftId,
          id: idOf({ kind: `unavailable-shift:${key}:${shiftId}` }),
        });
      }
    };
    await confirm({
      key: 'volunteer',
      userKind: personaUserKind({ key: 'volunteer' }),
      unavailable: [],
    });
    await confirm({
      key: 'elisa',
      userKind: poolUserKind({ key: 'elisa' }),
      unavailable: [worshipShifts.second],
    });
    await confirm({
      key: 'davi',
      userKind: poolUserKind({ key: 'davi' }),
      unavailable: [worshipShifts.first, worshipShifts.second],
    });
    await buildAvailabilityCheck({
      db,
      churchId,
      cycleId: cycle.id,
      ministryMembershipId: membershipIdOf({
        userKind: poolUserKind({ key: 'caio' }),
      }),
      id: idOf({ kind: 'availability-check:caio' }),
      state: 'pending',
    });

    return {
      anchor,
      ...base,
      cycle: { id: cycle.id, name: cycle.name },
      event: { id: event.id, title: event.title, startsAt },
      worship: worshipSchedule,
      worshipSecond,
      care: careSchedule,
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: assignChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}
