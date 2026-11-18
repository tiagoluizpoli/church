import { z } from 'zod';
import type { LoadAssignJourneyInput } from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'first-admin-onboarding';

export const FIRST_ADMIN_ONBOARDING_JOURNEY_SCHEMA = z.object({
  church: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1),
  }),
  adminEmail: z.string().min(1),
  invitationId: z.string().min(1),
  redemptionPath: z.string().startsWith('/invitations/church/'),
});

export type FirstAdminOnboardingJourney = z.infer<
  typeof FIRST_ADMIN_ONBOARDING_JOURNEY_SCHEMA
>;

/** A provisioned Church with its first-admin invitation unredeemed. */
export function loadFirstAdminOnboardingJourney({
  testInfo,
}: LoadAssignJourneyInput): FirstAdminOnboardingJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: FIRST_ADMIN_ONBOARDING_JOURNEY_SCHEMA,
    testInfo,
  });
}
