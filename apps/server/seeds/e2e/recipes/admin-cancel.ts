import { scheduleLastTold, swapRequest } from '@church/db';
import {
  addCalendarDays,
  type CalendarDay,
  parseInstant,
  toDate,
} from '@church/time';
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
  assignChurchRootKinds,
  buildAssignChurch,
  EVENT_END_TIME,
  EVENT_START_TIME,
} from './assign-church';
import { type AssignCycleSummary, buildAssignEvent } from './assign-event';

/**
 * The starting graph of the admin cancellation journey (J10, #826): a sent
 * Cycle whose one future Worship Event is published, with the Volunteer
 * confirmed on its single Usher seat, told of it, and an open SwapRequest on
 * that Assignment. A distinct ChurchAdmin cancels; the Worship leader is told.
 */
const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.adminCancel;
const CYCLE_LENGTH_DAYS = 28;
const EVENT_OFFSET_DAYS = 14;

const USHER = {
  ministry: 'worship',
  accessLevel: 'volunteer',
  roles: ['usher'],
} as const;

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
      memberships: [USHER],
    },
  },
  pool: {},
} as const satisfies AssignChurchPlan;

export interface AdminCancelJourney extends AssignChurch<typeof PLAN> {
  anchor: CalendarDay;
  cycle: AssignCycleSummary;
  event: { id: string; title: string };
  requirementId: string;
  assignmentId: string;
}

export function createAdminCancelRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<AdminCancelJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<AdminCancelJourney> {
    const base = await buildAssignChurch({ db, idOf, tag, plan: PLAN });
    const churchId = base.church.id;
    const { worship } = base.ministries;
    const cycle = await buildCycle({
      db,
      churchId,
      id: idOf({ kind: 'cycle' }),
      name: 'Ciclo de Cancelamento',
      startDate: anchor,
      endDate: addCalendarDays({ day: anchor, days: CYCLE_LENGTH_DAYS - 1 }),
      state: 'sent',
    });
    const service = await buildAssignEvent({
      db,
      idOf,
      churchId,
      cycleId: cycle.id,
      ministryId: worship.id,
      key: 'service',
      title: 'Culto Cancelável',
      day: addCalendarDays({ day: anchor, days: EVENT_OFFSET_DAYS }),
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
    const assignment = await buildAssignment({
      db,
      churchId,
      participationId: service.participationId,
      shiftId: service.shiftId,
      shiftRequirementId: service.requirements.usher.id,
      volunteerId: base.personas.volunteer.volunteerId,
      roleId: worship.roles.usher.id,
      id: idOf({ kind: 'assignment' }),
      status: 'confirmed',
    });
    // Publish told the Volunteer; Send updates later diffs against this.
    await db.insert(scheduleLastTold).values({
      churchId,
      ministryId: worship.id,
      cycleId: cycle.id,
      volunteerId: base.personas.volunteer.volunteerId,
      // Fixed, long before any cover the journey makes, so reloads stay identical.
      toldAt: toDate({
        instant: parseInstant({ value: '2000-01-01T00:00:00.000Z' }),
      }),
      assignments: [
        {
          assignmentId: assignment.id,
          shiftId: service.shiftId,
          eventId: service.id,
          eventTitle: service.title,
          eventStart: service.startsAt,
          eventEnd: service.endsAt,
          startsAt: service.startsAt,
          endsAt: service.endsAt,
          roleId: worship.roles.usher.id,
          roleName: worship.roles.usher.name,
          sectorId: worship.sectors.main.id,
          sectorName: worship.sectors.main.name,
        },
      ],
    });
    await db.insert(swapRequest).values({
      churchId,
      assignmentId: assignment.id,
      status: 'open',
      raisedBy: base.personas.volunteer.userId,
    });
    return {
      anchor,
      ...base,
      cycle: { id: cycle.id, name: cycle.name },
      event: { id: service.id, title: service.title },
      requirementId: service.requirements.usher.id,
      assignmentId: assignment.id,
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: assignChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}
