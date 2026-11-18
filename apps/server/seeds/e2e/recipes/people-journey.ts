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

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.peopleJourney;

/**
 * J2's starting graph: the state J4's joining flow leaves behind. A Church
 * with its ChurchAdmin, a Worship leader with no Roles and a Volunteer
 * qualified for one of Worship's two Roles, both already accepted.
 */
const PLAN = {
  ministries: {
    worship: {
      name: 'E2E Louvor',
      roles: { vocals: 'Vocal', guitar: 'Violão' },
      sectors: { main: 'Principal' },
    },
  },
  personas: {
    admin: {
      name: 'Ana Admin',
      churchAccessLevel: 'admin',
      memberships: [],
    },
    leader: {
      name: 'Lia Líder',
      churchAccessLevel: 'member',
      memberships: [{ ministry: 'worship', accessLevel: 'leader', roles: [] }],
    },
    volunteer: {
      name: 'Vitor Voluntário',
      churchAccessLevel: 'member',
      memberships: [
        { ministry: 'worship', accessLevel: 'volunteer', roles: ['vocals'] },
      ],
    },
  },
  pool: {},
} as const satisfies AssignChurchPlan;

export type PeopleJourney = AssignChurch<typeof PLAN>;

export function createPeopleJourneyRecipe({
  journeyKey,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<PeopleJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: assignChurchRootKinds({ plan: PLAN }) }),
    load: ({ db }: SeedRecipeLoadInput) =>
      buildAssignChurch({ db, idOf, tag, plan: PLAN }),
  };
}
