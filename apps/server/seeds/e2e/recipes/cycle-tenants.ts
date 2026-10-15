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
  mergeRootKinds,
} from './assign-church';
import type { AssignCycleSummary } from './assign-event';
import {
  cycleWindow,
  type SchedulingJourneyDates,
} from './scheduling-cycle-window';

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.cycleTenants;
const CHURCH_A_SCOPE = 'a';
const CHURCH_B_SCOPE = 'b';
const CHURCH_A_CYCLE_NAME = 'Ciclo Isolado Alfa';
const CHURCH_B_CYCLE_NAME = 'Ciclo Isolado Beta';

/**
 * Two tenants that each own a draft Cycle (#329: church isolation on
 * the cycles list and `$cycleId` route). Each Church has only its
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
} as const satisfies AssignChurchPlan;

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
} as const satisfies AssignChurchPlan;

const ROOT_KINDS = mergeRootKinds({
  rootKinds: [
    assignChurchRootKinds({ plan: CHURCH_A_PLAN, scope: CHURCH_A_SCOPE }),
    assignChurchRootKinds({ plan: CHURCH_B_PLAN, scope: CHURCH_B_SCOPE }),
  ],
});

export interface CycleTenant<TPlan extends AssignChurchPlan>
  extends AssignChurch<TPlan> {
  cycle: AssignCycleSummary;
}

export interface CycleTenantsJourney extends SchedulingJourneyDates {
  churchA: CycleTenant<typeof CHURCH_A_PLAN>;
  churchB: CycleTenant<typeof CHURCH_B_PLAN>;
}

export function createCycleTenantsRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<CycleTenantsJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<CycleTenantsJourney> {
    const window = cycleWindow({ anchor });
    const churchA = await buildAssignChurch({
      db,
      idOf,
      tag,
      plan: CHURCH_A_PLAN,
      scope: CHURCH_A_SCOPE,
    });
    const cycleA = await buildCycle({
      db,
      churchId: churchA.church.id,
      id: idOf({ kind: 'cycle:a' }),
      name: CHURCH_A_CYCLE_NAME,
      startDate: window.startDate,
      endDate: window.endDate,
      state: 'draft',
    });
    const churchB = await buildAssignChurch({
      db,
      idOf,
      tag,
      plan: CHURCH_B_PLAN,
      scope: CHURCH_B_SCOPE,
    });
    const cycleB = await buildCycle({
      db,
      churchId: churchB.church.id,
      id: idOf({ kind: 'cycle:b' }),
      name: CHURCH_B_CYCLE_NAME,
      startDate: window.startDate,
      endDate: window.endDate,
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
