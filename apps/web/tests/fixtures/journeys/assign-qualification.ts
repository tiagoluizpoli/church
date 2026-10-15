import { z } from 'zod';
import {
  ASSIGN_CYCLE_SCHEMA,
  ASSIGN_JOURNEY_BASE_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  ASSIGN_POOL_VOLUNTEER_SCHEMA,
  assignEventSchema,
  assignMinistrySchema,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'assign-qualification';

export const ASSIGN_QUALIFICATION_JOURNEY_SCHEMA =
  ASSIGN_JOURNEY_BASE_SCHEMA.extend({
    cycle: ASSIGN_CYCLE_SCHEMA,
    ministries: z.object({
      worship: assignMinistrySchema({
        roles: ['usher', 'greeter'],
        teams: ['alpha'],
      }),
      care: assignMinistrySchema({ roles: ['careHost'], teams: ['care'] }),
    }),
    personas: z.object({
      leader: ASSIGN_PERSONA_SCHEMA,
      teamLeader: ASSIGN_PERSONA_SCHEMA,
    }),
    pool: z.object({
      grace: ASSIGN_POOL_VOLUNTEER_SCHEMA,
      ada: ASSIGN_POOL_VOLUNTEER_SCHEMA,
      ursula: ASSIGN_POOL_VOLUNTEER_SCHEMA,
    }),
    event: assignEventSchema({ requirements: ['greeter', 'usher'] }),
  });

export type AssignQualificationJourney = z.infer<
  typeof ASSIGN_QUALIFICATION_JOURNEY_SCHEMA
>;

/** Loads this test's own qualification graph; signs nobody in. */
export function loadAssignQualificationJourney({
  testInfo,
}: LoadAssignJourneyInput): AssignQualificationJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: ASSIGN_QUALIFICATION_JOURNEY_SCHEMA,
    testInfo,
  });
}
