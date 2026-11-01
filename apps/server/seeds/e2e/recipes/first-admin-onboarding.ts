import { user } from '@church/db';
import { eq } from 'drizzle-orm';
import { buildProvisionedChurch } from '../../builders/church';
import type { SeedRecipeLoadInput } from '../../recipe';
import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  E2E_JOURNEY_TIMEZONE,
  journeyIdentity,
} from '../journey-keys';
import type { E2eJourneyRecipe } from '../journey-recipe';

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.firstAdminOnboarding;
const CHURCH_KIND = 'church';
const INVITATION_KIND = 'first-admin-invitation';

export interface FirstAdminOnboardingJourney {
  church: FirstAdminOnboardingChurch;
  /** The address provisioning invited; no User has it yet. */
  adminEmail: string;
  invitationId: string;
  /** The link provisioning prints for hand delivery. */
  redemptionPath: string;
}

export interface FirstAdminOnboardingChurch {
  id: string;
  name: string;
  slug: string;
}

/**
 * J0: a Church fresh from Platform Operator provisioning, with its first
 * ChurchAdmin invitation unredeemed. No Church Member, Ministry or Volunteer
 * exists: the journey itself joins as the first ChurchAdmin (J1).
 */
export function createFirstAdminOnboardingRecipe({
  journeyKey,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<FirstAdminOnboardingJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });
  const adminEmail = `first-admin@${tag}.e2e.test`;

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<FirstAdminOnboardingJourney> {
    // The joined admin is created by the product, not this graph: drop one an
    // earlier attempt of this same journey left, so a retry can join again.
    await db.delete(user).where(eq(user.email, adminEmail));
    const { church, adminInvitationId, redemptionPath } =
      await buildProvisionedChurch({
        db,
        id: idOf({ kind: CHURCH_KIND }),
        name: `E2E First Light ${tag}`,
        slug: `e2e-first-light-${tag}`,
        timezone: E2E_JOURNEY_TIMEZONE,
        adminEmail,
        adminInvitationId: idOf({ kind: INVITATION_KIND }),
      });
    return {
      church: { id: church.id, name: church.name, slug: church.slug },
      adminEmail,
      invitationId: adminInvitationId,
      redemptionPath,
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({
      rootKinds: { churchKinds: [CHURCH_KIND], userKinds: [] },
    }),
    load,
  };
}
