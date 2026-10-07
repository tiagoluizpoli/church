import { z } from 'zod';
import { loadJourneyRecipe } from '../journey-recipes';
import {
  type LoadRosteringJourneyInput,
  PLANNING_CYCLE_WINDOW_SCHEMA,
  ROSTERING_JOURNEY_BASE_SCHEMA,
  ROSTERING_PERSONA_SCHEMA,
  rosteringMinistrySchema,
} from './rostering-church';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'live-changes';

export const LIVE_CHANGES_JOURNEY_SCHEMA = ROSTERING_JOURNEY_BASE_SCHEMA.extend(
  {
    cycleWindow: PLANNING_CYCLE_WINDOW_SCHEMA,
    ministries: z.object({
      worship: rosteringMinistrySchema({
        roles: ['usher'],
        teams: ['alpha'],
      }),
    }),
    personas: z.object({
      leader: ROSTERING_PERSONA_SCHEMA,
      owner: ROSTERING_PERSONA_SCHEMA,
      teamLeader: ROSTERING_PERSONA_SCHEMA,
    }),
  },
);

export type LiveChangesJourney = z.infer<typeof LIVE_CHANGES_JOURNEY_SCHEMA>;

/** Loads this test's own graph; signs nobody in. */
export function loadLiveChangesJourney({
  testInfo,
}: LoadRosteringJourneyInput): LiveChangesJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: LIVE_CHANGES_JOURNEY_SCHEMA,
    testInfo,
  });
}
