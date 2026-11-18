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

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.invitationJourney;

/**
 * J4's starting graph: a Church with its ChurchAdmin and one Worship Ministry
 * holding two Roles. The leader and the Volunteer are not users yet: the
 * journey invites them, and their invitations, Users and Memberships are
 * created by the product, not by this recipe.
 */
const PLAN = {
  ministries: {
    worship: {
      name: 'E2E Louvor',
      roles: { usher: 'Recepcionista', greeter: 'Acolhimento' },
      sectors: { main: 'Principal' },
    },
  },
  personas: {
    admin: {
      name: 'Ana Admin',
      churchAccessLevel: 'admin',
      memberships: [],
    },
  },
  pool: {},
} as const satisfies AssignChurchPlan;

export interface InvitationJourney extends AssignChurch<typeof PLAN> {
  /** Distinct, unregistered addresses on the admin's per-journey domain. */
  leaderEmail: string;
  volunteerEmail: string;
}

export function createInvitationJourneyRecipe({
  journeyKey,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<InvitationJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({ db }: SeedRecipeLoadInput): Promise<InvitationJourney> {
    const graph = await buildAssignChurch({ db, idOf, tag, plan: PLAN });
    const domain = graph.personas.admin.email.split('@')[1];
    if (!domain) throw new Error("The admin's email has no domain");
    return {
      ...graph,
      leaderEmail: `new-leader@${domain}`,
      volunteerEmail: `new-volunteer@${domain}`,
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: assignChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}
