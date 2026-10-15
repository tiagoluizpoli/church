import { z } from 'zod';
import {
  ASSIGN_JOURNEY_BASE_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  assignMinistrySchema,
  CYCLE_WINDOW_SCHEMA,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'live-changes';

export const LIVE_CHANGES_JOURNEY_SCHEMA = ASSIGN_JOURNEY_BASE_SCHEMA.extend({
  cycleWindow: CYCLE_WINDOW_SCHEMA,
  ministries: z.object({
    worship: assignMinistrySchema({
      roles: ['usher'],
      teams: ['alpha'],
    }),
  }),
  personas: z.object({
    leader: ASSIGN_PERSONA_SCHEMA,
    owner: ASSIGN_PERSONA_SCHEMA,
    teamLeader: ASSIGN_PERSONA_SCHEMA,
  }),
});

export type LiveChangesJourney = z.infer<typeof LIVE_CHANGES_JOURNEY_SCHEMA>;

/** Loads this test's own graph; signs nobody in. */
export function loadLiveChangesJourney({
  testInfo,
}: LoadAssignJourneyInput): LiveChangesJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: LIVE_CHANGES_JOURNEY_SCHEMA,
    testInfo,
  });
}
