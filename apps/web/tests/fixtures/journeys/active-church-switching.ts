import { z } from 'zod';
import { loadJourneyRecipe } from '../journey-recipes';
import {
  type LoadRosteringJourneyInput,
  ROSTERING_CHURCH_MEMBERSHIP_SCHEMA,
  ROSTERING_CHURCH_SCHEMA,
  ROSTERING_CYCLE_SCHEMA,
  ROSTERING_PERSONA_SCHEMA,
  rosteringMinistrySchema,
} from './rostering-church';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'active-church-switching';

export const ACTIVE_CHURCH_SWITCHING_JOURNEY_SCHEMA = z.object({
  anchor: z.string().min(1),
  churchA: z.object({
    church: ROSTERING_CHURCH_SCHEMA,
    ministries: z.object({
      worship: rosteringMinistrySchema({ roles: ['usher'], teams: [] }),
    }),
    personas: z.object({ dualMember: ROSTERING_PERSONA_SCHEMA }),
  }),
  churchB: z.object({ church: ROSTERING_CHURCH_SCHEMA }),
  churchBMembership: ROSTERING_CHURCH_MEMBERSHIP_SCHEMA,
  cycles: z.object({
    first: ROSTERING_CYCLE_SCHEMA,
    second: ROSTERING_CYCLE_SCHEMA,
  }),
});

export type ActiveChurchSwitchingJourney = z.infer<
  typeof ACTIVE_CHURCH_SWITCHING_JOURNEY_SCHEMA
>;

/**
 * Loads this test's own two Churches and their dual member; signs nobody
 * in: the journey signs in through `/login`, since a User of two Churches
 * has no Active Church to resolve until they pick one.
 */
export function loadActiveChurchSwitchingJourney({
  testInfo,
}: LoadRosteringJourneyInput): ActiveChurchSwitchingJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: ACTIVE_CHURCH_SWITCHING_JOURNEY_SCHEMA,
    testInfo,
  });
}
