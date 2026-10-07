import { z } from 'zod';
import { loadJourneyRecipe } from '../journey-recipes';
import {
  type LoadRosteringJourneyInput,
  ROSTERING_CYCLE_SCHEMA,
  ROSTERING_JOURNEY_BASE_SCHEMA,
  ROSTERING_PERSONA_SCHEMA,
  ROSTERING_POOL_VOLUNTEER_SCHEMA,
  rosteringMinistrySchema,
} from './rostering-church';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'roster-publish';

const PARTICIPATION_SCHEMA = z.object({
  id: z.string().min(1),
  shiftId: z.string().min(1),
});

export const ROSTER_PUBLISH_JOURNEY_SCHEMA =
  ROSTERING_JOURNEY_BASE_SCHEMA.extend({
    ministries: z.object({
      worship: rosteringMinistrySchema({ roles: ['usher'], teams: [] }),
      care: rosteringMinistrySchema({ roles: ['careHost'], teams: ['care'] }),
    }),
    personas: z.object({
      leader: ROSTERING_PERSONA_SCHEMA,
      volunteer: ROSTERING_PERSONA_SCHEMA,
    }),
    pool: z.object({ other: ROSTERING_POOL_VOLUNTEER_SCHEMA }),
    cycle: ROSTERING_CYCLE_SCHEMA,
    event: z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      startsAt: z.string().min(1),
    }),
    worship: PARTICIPATION_SCHEMA.extend({ requiredCount: z.number() }),
    care: PARTICIPATION_SCHEMA,
  });

export type RosterPublishJourney = z.infer<
  typeof ROSTER_PUBLISH_JOURNEY_SCHEMA
>;

/** Loads this test's own graph; signs nobody in. */
export function loadRosterPublishJourney({
  testInfo,
}: LoadRosteringJourneyInput): RosterPublishJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: ROSTER_PUBLISH_JOURNEY_SCHEMA,
    testInfo,
  });
}
