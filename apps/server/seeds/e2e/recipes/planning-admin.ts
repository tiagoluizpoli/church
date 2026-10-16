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

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.planningAdmin;

/**
 * The Church whose ChurchAdmin plans (#329: cycle administration, the
 * create-event form, template library, cycle send edge cases): a Worship
 * Ministry the admin leads, and a plain Volunteer persona for the denial
 * checks. It holds no Cycle: the journey creates the cycles it
 * mutates, in a window of its own Church, so no other journey can overlap
 * them. Shared by the cycle-access recipe.
 */
export const PLANNING_ADMIN_PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Recepcionista' },
      sectors: { main: 'Principal' },
    },
  },
  personas: {
    admin: {
      name: 'Lia Prado',
      churchAccessLevel: 'admin',
      memberships: [{ ministry: 'worship', accessLevel: 'leader', roles: [] }],
    },
    volunteer: {
      name: 'Davi Moreira',
      churchAccessLevel: 'member',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: ['usher'],
        },
      ],
    },
  },
  pool: {},
} as const satisfies AssignChurchPlan;

export interface PlanningAdminJourney
  extends AssignChurch<typeof PLANNING_ADMIN_PLAN>,
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
    const graph = await buildAssignChurch({
      db,
      idOf,
      tag,
      plan: PLANNING_ADMIN_PLAN,
    });
    return { anchor, ...graph, cycleWindow: cycleWindow({ anchor }) };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({
      rootKinds: assignChurchRootKinds({ plan: PLANNING_ADMIN_PLAN }),
    }),
    load,
  };
}
