import { addChurchMember } from '@church/db';
import { hashPassword } from 'better-auth/crypto';
import { SEED_PERSONA_PASSWORD } from '../../blueprints/credentials';
import { buildAuthenticatableUser } from '../../builders/identity';
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

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.ministryRedemption;
const CHURCH_A_SCOPE = 'a';
const CHURCH_B_SCOPE = 'b';

/**
 * Church A is where invitations are minted and redeemed: its ChurchAdmin,
 * Worship and Care Ministries (one Role each), and a Church Member who has
 * no Volunteer profile yet (the existing-member journey's starting state).
 * Church B is a second tenant the new-user journey proves its outsider never
 * joins. The journeys mint and redeem the invitations themselves, through
 * the product.
 */
const CHURCH_A_PLAN = {
  ministries: {
    worship: {
      name: 'E2E Worship',
      roles: { usher: 'Usher' },
      teams: {},
    },
    care: {
      name: 'E2E Care',
      roles: { careHost: 'Care Host' },
      teams: {},
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

/** Id kinds of the member-only User; outside the base's reserved kinds. */
const MEMBER_ONLY_USER_KIND = 'member-only:user';
const MEMBER_ONLY_MEMBERSHIP_KIND = 'member-only:church-membership';
const MEMBER_ONLY_NAME = 'Marta Membro';

const ROOT_KINDS = mergeRootKinds({
  rootKinds: [
    rosteringChurchRootKinds({ plan: CHURCH_A_PLAN, scope: CHURCH_A_SCOPE }),
    rosteringChurchRootKinds({ plan: CHURCH_B_PLAN, scope: CHURCH_B_SCOPE }),
    { churchKinds: [], userKinds: [MEMBER_ONLY_USER_KIND] },
  ],
});

export interface ChurchMemberWithoutVolunteerProfile {
  userId: string;
  email: string;
  password: string;
  name: string;
}

export interface MinistryRedemptionJourney {
  churchA: RosteringChurch<typeof CHURCH_A_PLAN>;
  churchB: RosteringChurch<typeof CHURCH_B_PLAN>;
  /** A plain Church Member of Church A: no Ministry Membership, no Volunteer
   * profile. Built by hand rather than from a plan persona, because plan
   * personas always get a Volunteer profile. */
  memberOnly: ChurchMemberWithoutVolunteerProfile;
}

export function createMinistryRedemptionRecipe({
  journeyKey,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<MinistryRedemptionJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<MinistryRedemptionJourney> {
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

    const churchAEmailDomain = churchA.personas.admin.email.split('@')[1];
    if (!churchAEmailDomain)
      throw new Error("Church A's admin email has no domain");
    const memberOnlyUser = await buildAuthenticatableUser({
      db,
      id: idOf({ kind: MEMBER_ONLY_USER_KIND }),
      name: MEMBER_ONLY_NAME,
      // Church A's email domain: unique per journey and Church.
      email: `member-only@${churchAEmailDomain}`,
      passwordHash: await hashPassword(SEED_PERSONA_PASSWORD),
    });
    // Direct state by purpose (ADR 0006): the journey starts from a Member
    // who was never invited to a Ministry.
    await addChurchMember({
      db,
      churchId: churchA.church.id,
      userId: memberOnlyUser.id,
      accessLevel: 'member',
      id: idOf({ kind: MEMBER_ONLY_MEMBERSHIP_KIND }),
    });

    return {
      churchA,
      churchB,
      memberOnly: {
        userId: memberOnlyUser.id,
        email: memberOnlyUser.email,
        password: SEED_PERSONA_PASSWORD,
        name: memberOnlyUser.name,
      },
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: ROOT_KINDS }),
    load,
  };
}
