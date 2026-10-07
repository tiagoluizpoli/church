import { z } from 'zod';
import { loadJourneyRecipe } from '../journey-recipes';
import {
  type LoadRosteringJourneyInput,
  ROSTERING_CYCLE_SCHEMA,
  ROSTERING_JOURNEY_BASE_SCHEMA,
  ROSTERING_PERSONA_SCHEMA,
  ROSTERING_POOL_VOLUNTEER_SCHEMA,
  rosteringEventSchema,
  rosteringMinistrySchema,
} from './rostering-church';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'roster-qualification';

export const ROSTER_QUALIFICATION_JOURNEY_SCHEMA =
  ROSTERING_JOURNEY_BASE_SCHEMA.extend({
    cycle: ROSTERING_CYCLE_SCHEMA,
    ministries: z.object({
      worship: rosteringMinistrySchema({
        roles: ['usher', 'greeter'],
        teams: ['alpha'],
      }),
      care: rosteringMinistrySchema({ roles: ['careHost'], teams: ['care'] }),
    }),
    personas: z.object({
      leader: ROSTERING_PERSONA_SCHEMA,
      teamLeader: ROSTERING_PERSONA_SCHEMA,
    }),
    pool: z.object({
      grace: ROSTERING_POOL_VOLUNTEER_SCHEMA,
      ada: ROSTERING_POOL_VOLUNTEER_SCHEMA,
      ursula: ROSTERING_POOL_VOLUNTEER_SCHEMA,
    }),
    event: rosteringEventSchema({ requirements: ['greeter', 'usher'] }),
  });

export type RosterQualificationJourney = z.infer<
  typeof ROSTER_QUALIFICATION_JOURNEY_SCHEMA
>;

/** Loads this test's own qualification graph; signs nobody in. */
export function loadRosterQualificationJourney({
  testInfo,
}: LoadRosteringJourneyInput): RosterQualificationJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: ROSTER_QUALIFICATION_JOURNEY_SCHEMA,
    testInfo,
  });
}
