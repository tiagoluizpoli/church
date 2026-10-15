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
} from './assign-church';
import {
  cycleWindow,
  type SchedulingJourneyDates,
} from './scheduling-cycle-window';

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.leaderPrepare;

/**
 * A Worship Ministry the leader prepares alone in its own Church: the leader
 * owns the Ministry's usual setup, so no other journey can replace it.
 * The journey creates its own Cycle, template and events through the
 * API; the graph holds only what it starts from.
 */
const PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Recepcionista' },
      teams: {},
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
  },
  pool: {},
} as const satisfies AssignChurchPlan;

export interface LeaderPrepareJourney
  extends AssignChurch<typeof PLAN>,
    SchedulingJourneyDates {}

export function createLeaderPrepareRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<LeaderPrepareJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<LeaderPrepareJourney> {
    const graph = await buildAssignChurch({ db, idOf, tag, plan: PLAN });
    return {
      anchor,
      ...graph,
      cycleWindow: cycleWindow({ anchor }),
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: assignChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}
