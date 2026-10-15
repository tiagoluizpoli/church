import { buildPlanningCycle } from '../../builders/scheduling';
import type { SeedRecipeLoadInput } from '../../recipe';
import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  journeyIdentity,
} from '../journey-keys';
import type { E2eJourneyRecipe } from '../journey-recipe';
import {
  buildRosteringChurch,
  mergeRootKinds,
  type RosteringChurch,
  type RosteringChurchPlan,
  rosteringChurchRootKinds,
} from './rostering-church';
import type { RosteringCycleSummary } from './rostering-event';
import {
  planningCycleWindow,
  type SchedulingJourneyDates,
} from './scheduling-cycle-window';

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.planningCycleTenants;
const CHURCH_A_SCOPE = 'a';
const CHURCH_B_SCOPE = 'b';
const CHURCH_A_CYCLE_NAME = 'Ciclo Isolado Alfa';
const CHURCH_B_CYCLE_NAME = 'Ciclo Isolado Beta';

/**
 * Two tenants that each own a draft PlanningCycle (#329: church isolation on
 * the planning-cycles list and `$cycleId` route). Each Church has only its
 * ChurchAdmin; the names of the two cycles share no text, so a negative
 * assertion on one never matches the other.
 */
const CHURCH_A_PLAN = {
  ministries: {},
  personas: {
    admin: {
      name: 'Ana Admin',
      churchAccessLevel: 'admin',
      memberships: [],
    },
  },
  pool: {},
} as const satisfies RosteringChurchPlan;

const CHURCH_B_PLAN = {
  ministries: {},
  personas: {
    admin: {
      name: 'Bruno Admin',
      churchAccessLevel: 'admin',
      memberships: [],
    },
  },
  pool: {},
} as const satisfies RosteringChurchPlan;

const ROOT_KINDS = mergeRootKinds({
  rootKinds: [
    rosteringChurchRootKinds({ plan: CHURCH_A_PLAN, scope: CHURCH_A_SCOPE }),
    rosteringChurchRootKinds({ plan: CHURCH_B_PLAN, scope: CHURCH_B_SCOPE }),
  ],
});

export interface PlanningCycleTenant<TPlan extends RosteringChurchPlan>
  extends RosteringChurch<TPlan> {
  cycle: RosteringCycleSummary;
}

export interface PlanningCycleTenantsJourney extends SchedulingJourneyDates {
  churchA: PlanningCycleTenant<typeof CHURCH_A_PLAN>;
  churchB: PlanningCycleTenant<typeof CHURCH_B_PLAN>;
}

export function createPlanningCycleTenantsRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<PlanningCycleTenantsJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<PlanningCycleTenantsJourney> {
    const cycleWindow = planningCycleWindow({ anchor });
    const churchA = await buildRosteringChurch({
      db,
      idOf,
      tag,
      plan: CHURCH_A_PLAN,
      scope: CHURCH_A_SCOPE,
    });
    const cycleA = await buildPlanningCycle({
      db,
      churchId: churchA.church.id,
      id: idOf({ kind: 'planning-cycle:a' }),
      name: CHURCH_A_CYCLE_NAME,
      startDate: cycleWindow.startDate,
      endDate: cycleWindow.endDate,
      state: 'draft',
    });
    const churchB = await buildRosteringChurch({
      db,
      idOf,
      tag,
      plan: CHURCH_B_PLAN,
      scope: CHURCH_B_SCOPE,
    });
    const cycleB = await buildPlanningCycle({
      db,
      churchId: churchB.church.id,
      id: idOf({ kind: 'planning-cycle:b' }),
      name: CHURCH_B_CYCLE_NAME,
      startDate: cycleWindow.startDate,
      endDate: cycleWindow.endDate,
      state: 'draft',
    });
    return {
      anchor,
      cycleWindow,
      churchA: { ...churchA, cycle: { id: cycleA.id, name: cycleA.name } },
      churchB: { ...churchB, cycle: { id: cycleB.id, name: cycleB.name } },
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: ROOT_KINDS }),
    load,
  };
}
