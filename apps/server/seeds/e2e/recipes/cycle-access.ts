import { buildPlanningCycle } from '../../builders/scheduling';
import type { SeedRecipeLoadInput } from '../../recipe';
import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  journeyIdentity,
} from '../journey-keys';
import type { E2eJourneyRecipe } from '../journey-recipe';
import { PLANNING_ADMIN_PLAN } from './planning-admin';
import {
  buildRosteringChurch,
  type RosteringChurch,
  rosteringChurchRootKinds,
} from './rostering-church';
import type { RosteringCycleSummary } from './rostering-event';
import {
  planningCycleWindow,
  type SchedulingJourneyDates,
} from './scheduling-cycle-window';

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.planningCycleAccess;
const CYCLE_NAME = 'Ciclo de Acesso';

/**
 * The planning-admin Church with one locked PlanningCycle (#329: the role
 * guard matrix and the breadcrumb accessibility scan). Both only read the
 * cycle, through its planning page and the Worship cycle builder.
 */
export interface PlanningCycleAccessJourney
  extends RosteringChurch<typeof PLANNING_ADMIN_PLAN>,
    SchedulingJourneyDates {
  cycle: RosteringCycleSummary;
}

export function createPlanningCycleAccessRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<PlanningCycleAccessJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<PlanningCycleAccessJourney> {
    const graph = await buildRosteringChurch({
      db,
      idOf,
      tag,
      plan: PLANNING_ADMIN_PLAN,
    });
    const cycleWindow = planningCycleWindow({ anchor });
    const cycle = await buildPlanningCycle({
      db,
      churchId: graph.church.id,
      id: idOf({ kind: 'planning-cycle' }),
      name: CYCLE_NAME,
      startDate: cycleWindow.startDate,
      endDate: cycleWindow.endDate,
      state: 'locked',
    });
    return {
      anchor,
      ...graph,
      cycleWindow,
      cycle: { id: cycle.id, name: cycle.name },
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({
      rootKinds: rosteringChurchRootKinds({ plan: PLANNING_ADMIN_PLAN }),
    }),
    load,
  };
}
