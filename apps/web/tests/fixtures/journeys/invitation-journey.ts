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
const RECIPE_NAME = 'invitation-journey';

export const INVITATION_JOURNEY_SCHEMA = z.object({
  church: ASSIGN_CHURCH_SCHEMA,
  ministries: z.object({
    worship: assignMinistrySchema({
      roles: ['usher', 'greeter'],
      sectors: ['main'],
    }),
  }),
  personas: z.object({ admin: ASSIGN_PERSONA_SCHEMA }),
  leaderEmail: z.string().min(1),
  volunteerEmail: z.string().min(1),
});

export type InvitationJourney = z.infer<typeof INVITATION_JOURNEY_SCHEMA>;

/** Loads this test's own graph; signs nobody in. */
export function loadInvitationJourney({
  testInfo,
}: LoadAssignJourneyInput): InvitationJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: INVITATION_JOURNEY_SCHEMA,
    testInfo,
  });
}
