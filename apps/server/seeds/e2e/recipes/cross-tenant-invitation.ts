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

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.crossTenantInvitation;

const CHURCH_A_SCOPE = 'a';
const CHURCH_B_SCOPE = 'b';

/**
 * Two tenants that share nothing: each has its own ChurchAdmin and one
 * Ministry. The journey has Church A's admin probe Church B's Ministry and
 * Ministry Invitations, which Church B's admin mints through the product.
 */
const CHURCH_A_PLAN = {
  ministries: {
    worship: { name: 'E2E Church A Ministry', roles: {}, teams: {} },
  },
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
  ministries: {
    worship: { name: 'E2E Church B Ministry', roles: {}, teams: {} },
  },
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

export interface CrossTenantInvitationEmails {
  /** Invited by the probe that must fail. */
  probe: string;
  /** Invited by Church B's own admin, then probed by Church A's. */
  target: string;
}

export interface CrossTenantInvitationJourney {
  churchA: RosteringChurch<typeof CHURCH_A_PLAN>;
  churchB: RosteringChurch<typeof CHURCH_B_PLAN>;
  /** Unique per journey key. A retry reuses the key and so the addresses; its
   * purge deletes the earlier attempt's Church B and invitation first. */
  emails: CrossTenantInvitationEmails;
}

export function createCrossTenantInvitationRecipe({
  journeyKey,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<CrossTenantInvitationJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<CrossTenantInvitationJourney> {
    const churchA = await buildRosteringChurch({
      db,
      idOf,
      tag,
      plan: CHURCH_A_PLAN,
      scope: CHURCH_A_SCOPE,
    });
    const churchB = await buildRosteringChurch({
      db,
      idOf,
      tag,
      plan: CHURCH_B_PLAN,
      scope: CHURCH_B_SCOPE,
    });
    return {
      churchA,
      churchB,
      emails: {
        probe: `cross-tenant-probe@${tag}.e2e.test`,
        target: `cross-tenant-target@${tag}.e2e.test`,
      },
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: ROOT_KINDS }),
    load,
  };
}
