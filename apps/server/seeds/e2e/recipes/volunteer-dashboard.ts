import {
  addCalendarDays,
  type CalendarDay,
  type Instant,
  parseTimeOfDay,
  type TimeOfDay,
} from '@church/time';
import { buildVolunteerNotification } from '../../builders/notification';
import { buildAssignment, buildCycle } from '../../builders/scheduling';
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
import { type AssignEvent, buildAssignEvent } from './assign-event';

/**
 * The starting graph of the Volunteer Dashboard journeys (#329): a small
 * Church whose one Volunteer persona sits in two Ministries and owns what
 * the dashboard shows: a confirmed Assignment on a published Care event
 *, an event still needing availability, and an
 * unread notification. The notification reports a removal the way the
 * product leaves one: the Assignment row is gone (its id survives only in the
 * payload), on a past event that is neither upcoming nor awaiting
 * availability. Every date hangs from the anchor.
 */

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.volunteerDashboard;
const CYCLE_LENGTH_DAYS = 14;
const CARE_EVENT_OFFSET_DAYS = 3;
const AVAILABILITY_EVENT_OFFSET_DAYS = 7;
/** The day before the anchor, so the notification is never in the future. */
const NOTIFICATION_OFFSET_DAYS = -1;
const NOTIFICATION_TIME: TimeOfDay = parseTimeOfDay({ value: '08:00' });
/** The removed Assignment's event: past, after the removal notice it begat. */
const REMOVED_EVENT_OFFSET_DAYS = -1;

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
        {
          ministry: 'care',
          accessLevel: 'volunteer',
          roles: ['careHost'],
        },
      ],
    },
  },
  pool: {},
} as const satisfies AssignChurchPlan;

type DashboardChurch = AssignChurch<typeof PLAN>;

export interface VolunteerDashboardNotification {
  id: string;
  title: string;
  createdAt: Instant;
}

export interface VolunteerDashboardJourney extends DashboardChurch {
  anchor: CalendarDay;
  /** Published Care event the Volunteer is confirmed on. */
  careEvent: AssignEvent<'careHost'>;
  /** Event whose availability the Volunteer has not answered. */
  availabilityEvent: AssignEvent<'usher'>;
  /** Past event whose Assignment was removed; no row is left on it. */
  removedEvent: AssignEvent<'usher'>;
  notification: VolunteerDashboardNotification;
}

export function createVolunteerDashboardRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<VolunteerDashboardJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<VolunteerDashboardJourney> {
    const base = await buildAssignChurch({ db, idOf, tag, plan: PLAN });
    const churchId = base.church.id;
    const { worship, care } = base.ministries;
    const { volunteer } = base.personas;

    const cycle = await buildCycle({
      db,
      churchId,
      id: idOf({ kind: 'cycle' }),
      name: 'Ciclo E2E',
      startDate: anchor,
      endDate: addCalendarDays({ day: anchor, days: CYCLE_LENGTH_DAYS }),
      state: 'sent',
    });

    const careEvent = await buildAssignEvent({
      db,
      idOf,
      churchId,
      cycleId: cycle.id,
      ministryId: care.id,
      key: 'care',
      title: 'Encontro de Cuidado',
      day: addCalendarDays({ day: anchor, days: CARE_EVENT_OFFSET_DAYS }),
      startTime: EVENT_START_TIME,
      endTime: EVENT_END_TIME,
      eventStatus: 'scheduled',
      participationState: 'published',
      requirements: {
        careHost: {
          roleId: care.roles.careHost.id,
          peopleNeeded: 1,
          sectorId: care.sectors.main.id,
        },
      },
    });
    await buildAssignment({
      db,
      churchId,
      participationId: careEvent.participationId,
      shiftId: careEvent.shiftId,
      volunteerId: volunteer.volunteerId,
      roleId: care.roles.careHost.id,
      id: idOf({ kind: 'assignment:care' }),
      status: 'confirmed',
    });
    const availabilityEvent = await buildAssignEvent({
      db,
      idOf,
      churchId,
      cycleId: cycle.id,
      ministryId: worship.id,
      key: 'availability',
      title: 'Ensaio Geral',
      day: addCalendarDays({
        day: anchor,
        days: AVAILABILITY_EVENT_OFFSET_DAYS,
      }),
      startTime: EVENT_START_TIME,
      endTime: EVENT_END_TIME,
      eventStatus: 'scheduled',
      participationState: 'published',
      requirements: {
        usher: {
          roleId: worship.roles.usher.id,
          peopleNeeded: 1,
          sectorId: worship.sectors.main.id,
        },
      },
    });

    // The product removes an Assignment by deleting its row (reassignment
    // and own-cancellation alike), so the removed one leaves an open shift and
    // a notification whose payload still names the deleted id. The event is
    // past, which keeps it off the upcoming list and the availability tasks.
    const removedEvent = await buildAssignEvent({
      db,
      idOf,
      churchId,
      cycleId: cycle.id,
      ministryId: worship.id,
      key: 'removed',
      title: 'Culto de Domingo',
      day: addCalendarDays({ day: anchor, days: REMOVED_EVENT_OFFSET_DAYS }),
      startTime: EVENT_START_TIME,
      endTime: EVENT_END_TIME,
      eventStatus: 'scheduled',
      participationState: 'published',
      requirements: {
        usher: {
          roleId: worship.roles.usher.id,
          peopleNeeded: 1,
          sectorId: worship.sectors.main.id,
        },
      },
    });

    const notificationCreatedAt = anchoredInstant({
      anchor,
      dayOffset: NOTIFICATION_OFFSET_DAYS,
      time: NOTIFICATION_TIME,
    });
    const notification = await buildVolunteerNotification({
      db,
      churchId,
      volunteerId: volunteer.volunteerId,
      id: idOf({ kind: 'notification' }),
      type: 'assignment_removed',
      title: 'Assignment removed',
      body: `You are no longer scheduled for ${worship.roles.usher.name} at ${removedEvent.title}.`,
      payload: {
        assignmentId: idOf({ kind: 'assignment:removed' }),
        eventId: removedEvent.id,
        ministryId: worship.id,
        section: 'assignments',
      },
      createdAt: notificationCreatedAt,
      ministryId: worship.id,
      eventId: removedEvent.id,
    });

    return {
      anchor,
      ...base,
      careEvent,
      availabilityEvent,
      removedEvent,
      notification: {
        id: notification.id,
        title: notification.title,
        createdAt: notificationCreatedAt,
      },
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: assignChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}
