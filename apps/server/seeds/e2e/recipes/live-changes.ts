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

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.liveChanges;

/**
 * One Worship Ministry with an Usher Role, its leader, and two qualified
 * Usher personas: the owner who holds and cancels the assignments, and a
 * TeamLeader who may not cancel them and is the reassignment target. The
 * journey creates its own PlanningCycle, template and events through the
 * API and publishes only to its own personas.
 */
const PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Recepcionista' },
      teams: { alpha: 'Equipe Alpha' },
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
    owner: {
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

export interface LiveChangesJourney
  extends RosteringChurch<typeof PLAN>,
    SchedulingJourneyDates {}

export function createLiveChangesRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<LiveChangesJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<LiveChangesJourney> {
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
