import { z } from 'zod';
import {
  ASSIGN_CHURCH_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  assignMinistrySchema,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'ministry-redemption';

/** A Church Member with no Volunteer profile, so no `volunteerId`. */
export const CHURCH_MEMBER_WITHOUT_VOLUNTEER_SCHEMA = z.object({
  userId: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(1),
  name: z.string().min(1),
});

export const MINISTRY_REDEMPTION_JOURNEY_SCHEMA = z.object({
  churchA: z.object({
    church: ASSIGN_CHURCH_SCHEMA,
    ministries: z.object({
      worship: assignMinistrySchema({ roles: ['usher'], teams: [] }),
      care: assignMinistrySchema({ roles: ['careHost'], teams: [] }),
    }),
    personas: z.object({ admin: ASSIGN_PERSONA_SCHEMA }),
  }),
  churchB: z.object({
    church: ASSIGN_CHURCH_SCHEMA,
    personas: z.object({ admin: ASSIGN_PERSONA_SCHEMA }),
  }),
  memberOnly: CHURCH_MEMBER_WITHOUT_VOLUNTEER_SCHEMA,
});

export type MinistryRedemptionJourney = z.infer<
  typeof MINISTRY_REDEMPTION_JOURNEY_SCHEMA
>;

/** Loads this test's own graph; signs nobody in. */
export function loadMinistryRedemptionJourney({
  testInfo,
}: LoadAssignJourneyInput): MinistryRedemptionJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: MINISTRY_REDEMPTION_JOURNEY_SCHEMA,
    testInfo,
  });
}
