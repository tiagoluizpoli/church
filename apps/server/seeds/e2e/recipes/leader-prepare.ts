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

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.leaderTailoring;

/**
 * A Worship Ministry the leader tailors alone in its own Church: the leader
 * owns the Ministry's serving profile, so no other journey can replace it.
 * The journey creates its own PlanningCycle, template and events through the
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
} as const satisfies RosteringChurchPlan;

export interface LeaderTailoringJourney
  extends RosteringChurch<typeof PLAN>,
    SchedulingJourneyDates {}

export function createLeaderTailoringRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<LeaderTailoringJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<LeaderTailoringJourney> {
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
