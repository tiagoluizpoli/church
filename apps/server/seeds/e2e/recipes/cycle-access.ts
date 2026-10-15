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
  assignChurchRootKinds,
  buildAssignChurch,
} from './assign-church';
import type { AssignCycleSummary } from './assign-event';
import { PLANNING_ADMIN_PLAN } from './planning-admin';
import {
  cycleWindow,
  type SchedulingJourneyDates,
} from './scheduling-cycle-window';

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.cycleAccess;
const CYCLE_NAME = 'Ciclo de Acesso';

/**
 * The planning-admin Church with one sent Cycle (#329: the role
 * guard matrix and the breadcrumb accessibility scan). Both only read the
 * cycle, through its planning page and the Worship cycle builder.
 */
export interface CycleAccessJourney
  extends AssignChurch<typeof PLANNING_ADMIN_PLAN>,
    SchedulingJourneyDates {
  cycle: AssignCycleSummary;
}

export function createCycleAccessRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<CycleAccessJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<CycleAccessJourney> {
    const graph = await buildAssignChurch({
      db,
      idOf,
      tag,
      plan: PLANNING_ADMIN_PLAN,
    });
    const window = cycleWindow({ anchor });
    const cycle = await buildCycle({
      db,
      churchId: graph.church.id,
      id: idOf({ kind: 'cycle' }),
      name: CYCLE_NAME,
      startDate: window.startDate,
      endDate: window.endDate,
      state: 'sent',
    });
    return {
      anchor,
      ...graph,
      cycleWindow: window,
      cycle: { id: cycle.id, name: cycle.name },
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({
      rootKinds: assignChurchRootKinds({ plan: PLANNING_ADMIN_PLAN }),
    }),
    load,
  };
}
