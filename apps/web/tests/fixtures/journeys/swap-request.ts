import { z } from 'zod';
import {
  ASSIGN_CYCLE_SCHEMA,
  ASSIGN_JOURNEY_BASE_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  assignMinistrySchema,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'swap-request';

export const SWAP_REQUEST_JOURNEY_SCHEMA = ASSIGN_JOURNEY_BASE_SCHEMA.extend({
  ministries: z.object({
    worship: assignMinistrySchema({ roles: ['usher'], sectors: ['main'] }),
  }),
  personas: z.object({
    leader: ASSIGN_PERSONA_SCHEMA,
    volunteer: ASSIGN_PERSONA_SCHEMA,
    replacement: ASSIGN_PERSONA_SCHEMA,
  }),
  pool: z.object({}),
  cycle: ASSIGN_CYCLE_SCHEMA,
  event: z.object({ id: z.string().min(1), title: z.string().min(1) }),
  requirementId: z.string().min(1),
  assignmentId: z.string().min(1),
});

export type SwapRequestJourney = z.infer<typeof SWAP_REQUEST_JOURNEY_SCHEMA>;

/** Loads this test's own graph; signs nobody in. */
export function loadSwapRequestJourney({
  testInfo,
}: LoadAssignJourneyInput): SwapRequestJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: SWAP_REQUEST_JOURNEY_SCHEMA,
    testInfo,
  });
}
