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

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.planningAdmin;

/**
 * The Church whose ChurchAdmin plans (#329: cycle administration, the
 * create-event form, template library, cycle lock edge cases): a Worship
 * Ministry the admin leads, and a plain Volunteer persona for the denial
 * checks. It holds no PlanningCycle: the journey creates the cycles it
 * mutates, in a window of its own Church, so no other journey can overlap
 * them. Shared by the planning-cycle-access recipe.
 */
export const PLANNING_ADMIN_PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Recepcionista' },
      teams: {},
    },
  },
  personas: {
    admin: {
      name: 'Lia Prado',
      churchAccessLevel: 'admin',
      memberships: [
        { ministry: 'worship', accessLevel: 'leader', roles: [], teams: [] },
      ],
    },
    volunteer: {
      name: 'Davi Moreira',
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
  },
  pool: {},
} as const satisfies RosteringChurchPlan;

export interface PlanningAdminJourney
  extends RosteringChurch<typeof PLANNING_ADMIN_PLAN>,
    SchedulingJourneyDates {}

export function createPlanningAdminRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<PlanningAdminJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<PlanningAdminJourney> {
    const graph = await buildRosteringChurch({
      db,
      idOf,
      tag,
      plan: PLANNING_ADMIN_PLAN,
    });
    return { anchor, ...graph, cycleWindow: planningCycleWindow({ anchor }) };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({
      rootKinds: rosteringChurchRootKinds({ plan: PLANNING_ADMIN_PLAN }),
    }),
    load,
  };
}
