import type { SeedRecipeLoadInput } from '../../recipe';
import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  journeyIdentity,
} from '../journey-keys';
import type { E2eJourneyRecipe } from '../journey-recipe';
import {
  buildRosteringChurch,
  type RosteringChurch,
  type RosteringChurchPlan,
  rosteringChurchRootKinds,
} from './rostering-church';
import {
  planningCycleWindow,
  type SchedulingJourneyDates,
} from './scheduling-cycle-window';

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.volunteerAvailability;

/**
 * Two Ministries whose serving profiles only this journey writes, a leader
 * who is a Volunteer in both (so a same-time Worship and Care shift overlaps
 * for them), and a TeamLeader in Worship alone (a clean, single-Ministry
 * confirm). The journey creates its own PlanningCycle, template and events
 * through the API; the graph holds only what it starts from.
 */
const PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Recepcionista' },
      teams: { alpha: 'Equipe Alpha' },
    },
    care: {
      name: 'Cuidado',
      roles: { careHost: 'Anfitriao de Cuidado' },
      teams: { care: 'Equipe Cuidado' },
    },
  },
  personas: {
    leader: {
      name: 'Lia Prado',
      churchAccessLevel: 'admin',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'leader',
          roles: ['usher'],
          teams: [],
        },
        {
          ministry: 'care',
          accessLevel: 'volunteer',
          roles: ['careHost'],
          teams: [{ team: 'care', accessLevel: 'member' }],
        },
      ],
    },
    teamLeader: {
      name: 'Tomas Reis',
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
  pool: {},
} as const satisfies RosteringChurchPlan;

export interface VolunteerAvailabilityJourney
  extends RosteringChurch<typeof PLAN>,
    SchedulingJourneyDates {}

export function createVolunteerAvailabilityRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<VolunteerAvailabilityJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<VolunteerAvailabilityJourney> {
    const graph = await buildRosteringChurch({ db, idOf, tag, plan: PLAN });
    return {
      anchor,
      ...graph,
      cycleWindow: planningCycleWindow({ anchor }),
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: rosteringChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}
