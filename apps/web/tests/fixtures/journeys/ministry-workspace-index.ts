import { z } from 'zod';
import {
  ASSIGN_JOURNEY_BASE_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  assignMinistrySchema,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'ministry-workspace-index';

export const MINISTRY_WORKSPACE_INDEX_JOURNEY_SCHEMA =
  ASSIGN_JOURNEY_BASE_SCHEMA.extend({
    ministries: z.object({
      worship: assignMinistrySchema({ roles: [], sectors: ['main'] }),
      care: assignMinistrySchema({ roles: [], sectors: ['main'] }),
    }),
    personas: z.object({
      admin: ASSIGN_PERSONA_SCHEMA,
      ministryLeader: ASSIGN_PERSONA_SCHEMA,
    }),
  });

export type MinistryWorkspaceIndexJourney = z.infer<
  typeof MINISTRY_WORKSPACE_INDEX_JOURNEY_SCHEMA
>;

/** Loads this test's own Church; the Ministry leader leads only Worship. */
export function loadMinistryWorkspaceIndexJourney({
  testInfo,
}: LoadAssignJourneyInput): MinistryWorkspaceIndexJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: MINISTRY_WORKSPACE_INDEX_JOURNEY_SCHEMA,
    testInfo,
  });
}
