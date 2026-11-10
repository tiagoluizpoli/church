import { scheduleLastTold } from '@church/db';
import { addCalendarDays, type CalendarDay } from '@church/time';
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
 * The starting graph of the swap-request journey (J9, #812): a sent Cycle
 * whose one Worship Event is already published, with the Volunteer confirmed
 * on its single Usher seat. A second qualified Volunteer is the replacement
 * the leader reassigns to. Assignment and publish setup are not retested.
 */
const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.swapRequest;
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
    leader: {
      name: 'Lia Prado',
      churchAccessLevel: 'admin',
      memberships: [{ ministry: 'worship', accessLevel: 'leader', roles: [] }],
    },
    volunteer: {
      name: 'Rafael Moura',
      churchAccessLevel: 'member',
      memberships: [USHER],
    },
    replacement: {
      name: 'Beatriz Campos',
      churchAccessLevel: 'member',
      memberships: [USHER],
    },
  },
  pool: {},
} as const satisfies AssignChurchPlan;

export interface SwapRequestJourney extends AssignChurch<typeof PLAN> {
  anchor: CalendarDay;
  cycle: AssignCycleSummary;
  event: { id: string; title: string };
  requirementId: string;
  assignmentId: string;
}

export function createSwapRequestRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<SwapRequestJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<SwapRequestJourney> {
    const base = await buildAssignChurch({ db, idOf, tag, plan: PLAN });
    const churchId = base.church.id;
    const { worship } = base.ministries;
    const cycle = await buildCycle({
      db,
      churchId,
      id: idOf({ kind: 'cycle' }),
      name: 'Ciclo de Trocas',
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
      title: 'Culto de Trocas',
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
