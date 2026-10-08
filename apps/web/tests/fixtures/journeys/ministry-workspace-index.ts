import { z } from 'zod';
import { loadJourneyRecipe } from '../journey-recipes';
import {
  type LoadRosteringJourneyInput,
  ROSTERING_JOURNEY_BASE_SCHEMA,
  ROSTERING_PERSONA_SCHEMA,
  rosteringMinistrySchema,
} from './rostering-church';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'ministry-workspace-index';

export const MINISTRY_WORKSPACE_INDEX_JOURNEY_SCHEMA =
  ROSTERING_JOURNEY_BASE_SCHEMA.extend({
    ministries: z.object({
      worship: rosteringMinistrySchema({ roles: [], teams: [] }),
      care: rosteringMinistrySchema({ roles: [], teams: [] }),
    }),
    personas: z.object({
      admin: ROSTERING_PERSONA_SCHEMA,
      ministryLeader: ROSTERING_PERSONA_SCHEMA,
    }),
  });

export type MinistryWorkspaceIndexJourney = z.infer<
  typeof MINISTRY_WORKSPACE_INDEX_JOURNEY_SCHEMA
>;

/** Loads this test's own Church; the Ministry leader leads only Worship. */
export function loadMinistryWorkspaceIndexJourney({
  testInfo,
}: LoadRosteringJourneyInput): MinistryWorkspaceIndexJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: MINISTRY_WORKSPACE_INDEX_JOURNEY_SCHEMA,
    testInfo,
  });
}
