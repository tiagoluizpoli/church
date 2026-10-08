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

/**
 * The E2E suite's shared read-only identities (#320 decision 19): one
 * Church with a ChurchAdmin and a Volunteer, loaded once by Playwright
 * global setup, which signs both in and saves their storage states for
 * every worker. A spec may act as them but never mutates the domain data
 * they reach; a journey that mutates loads its own recipe instead.
 *
 * Loading it also provisions the local Platform Operator every journey
 * Church is provisioned by, before any worker starts.
 */

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.sharedPersonas;

const SHARED_PERSONAS_PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Recepcionista' },
      teams: {},
    },
  },
  personas: {
    churchAdmin: {
      name: 'Alice Almeida',
      churchAccessLevel: 'admin',
      memberships: [],
    },
    volunteer: {
      name: 'Vitor Vasconcelos',
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

const ROOT_KINDS = rosteringChurchRootKinds({ plan: SHARED_PERSONAS_PLAN });

export type SharedPersonas = RosteringChurch<typeof SHARED_PERSONAS_PLAN>;

export function createSharedPersonasRecipe({
  journeyKey,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<SharedPersonas> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({ db }: SeedRecipeLoadInput): Promise<SharedPersonas> {
    return await buildRosteringChurch({
      db,
      idOf,
      tag,
      plan: SHARED_PERSONAS_PLAN,
    });
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: ROOT_KINDS }),
    load,
  };
}
