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
const RECIPE_NAME = 'people-journey';

export const PEOPLE_JOURNEY_SCHEMA = z.object({
  church: ASSIGN_CHURCH_SCHEMA,
  ministries: z.object({
    worship: assignMinistrySchema({
      roles: ['vocals', 'guitar'],
      sectors: ['main'],
    }),
  }),
  personas: z.object({
    admin: ASSIGN_PERSONA_SCHEMA,
    leader: ASSIGN_PERSONA_SCHEMA,
    volunteer: ASSIGN_PERSONA_SCHEMA,
  }),
});

export type PeopleJourney = z.infer<typeof PEOPLE_JOURNEY_SCHEMA>;

/** Loads this test's own graph; signs nobody in. */
export function loadPeopleJourney({
  testInfo,
}: LoadAssignJourneyInput): PeopleJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: PEOPLE_JOURNEY_SCHEMA,
    testInfo,
  });
}
