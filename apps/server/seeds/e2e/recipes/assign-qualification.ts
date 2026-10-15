import { addCalendarDays, type CalendarDay } from '@church/time';
import { buildCycle } from '../../builders/scheduling';
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
import {
  type AssignCycleSummary,
  type AssignEvent,
  buildAssignEvent,
} from './assign-event';

/**
 * Qualification governs candidacy (#329: qualification.spec): one Worship
 * cycle with one future, draft Event at `availability_requested`, needing a Team
 * Alpha Greeter and an Usher. Its candidates make the rule separable:
 *
 * - Grace: qualified for both Roles, in Team Alpha — the only qualified
 *   Greeter the TeamLeader can schedule.
 * - Ada: qualified for both Roles, outside every Team.
 * - Ursula: in Team Alpha and the Ministry, qualified for nothing.
 *
 * The TeamLeader leads Team Alpha and qualifies only as an Usher, so they
 * are no Greeter candidate themselves. A second Ministry's Team (Care) is a
 * Team the TeamLeader does not lead.
 */

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.assignQualification;
const CYCLE_LENGTH_DAYS = 28;
const EVENT_OFFSET_DAYS = 10;

const PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Recepcionista', greeter: 'Acolhedor' },
      teams: { alpha: 'Equipe Alfa' },
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
      ],
    },
    teamLeader: {
      name: 'Tomás Reis',
      churchAccessLevel: 'member',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: ['usher'],
          teams: [{ team: 'alpha', accessLevel: 'leader' }],
        },
      ],
    },
  },
  pool: {
    grace: {
      name: 'Grace Hopper',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: ['usher', 'greeter'],
          teams: [{ team: 'alpha', accessLevel: 'member' }],
        },
      ],
    },
    ada: {
      name: 'Ada Lovelace',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: ['usher', 'greeter'],
          teams: [],
        },
      ],
    },
    ursula: {
      name: 'Ursula Unqualified',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: [],
          teams: [{ team: 'alpha', accessLevel: 'member' }],
        },
      ],
    },
  },
} as const satisfies AssignChurchPlan;

export interface AssignQualificationJourney extends AssignChurch<typeof PLAN> {
  anchor: CalendarDay;
  cycle: AssignCycleSummary;
  event: AssignEvent<'greeter' | 'usher'>;
}

export function createAssignQualificationRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<AssignQualificationJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<AssignQualificationJourney> {
    const base = await buildAssignChurch({ db, idOf, tag, plan: PLAN });
    const churchId = base.church.id;
    const { worship } = base.ministries;

    const cycle = await buildCycle({
      db,
      churchId,
      id: idOf({ kind: 'cycle' }),
      name: 'Ciclo da Equipe',
      startDate: anchor,
      endDate: addCalendarDays({ day: anchor, days: CYCLE_LENGTH_DAYS }),
      state: 'sent',
    });
    // Draft and `availability_requested`: the journey schedules the Event and
    // stages the first assignment itself, which moves it into assign.
    const event = await buildAssignEvent({
      db,
      idOf,
      churchId,
      cycleId: cycle.id,
      ministryId: worship.id,
      key: 'team-service',
      title: 'Culto da Equipe',
      day: addCalendarDays({ day: anchor, days: EVENT_OFFSET_DAYS }),
      startTime: EVENT_START_TIME,
      endTime: EVENT_END_TIME,
      eventStatus: 'draft',
      participationState: 'availability_requested',
      requirements: {
        greeter: {
          roleId: worship.roles.greeter.id,
          requiredCount: 1,
          teamId: worship.teams.alpha.id,
        },
        usher: { roleId: worship.roles.usher.id, requiredCount: 1 },
      },
    });

    return {
      anchor,
      ...base,
      cycle: { id: cycle.id, name: cycle.name },
      event,
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: assignChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}
