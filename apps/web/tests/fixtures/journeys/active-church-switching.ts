import { z } from 'zod';
import {
  ASSIGN_CHURCH_MEMBERSHIP_SCHEMA,
  ASSIGN_CHURCH_SCHEMA,
  ASSIGN_CYCLE_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  assignMinistrySchema,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'active-church-switching';

export const ACTIVE_CHURCH_SWITCHING_JOURNEY_SCHEMA = z.object({
  anchor: z.string().min(1),
  churchA: z.object({
    church: ASSIGN_CHURCH_SCHEMA,
    ministries: z.object({
      worship: assignMinistrySchema({ roles: ['usher'], teams: [] }),
    }),
    personas: z.object({ dualMember: ASSIGN_PERSONA_SCHEMA }),
  }),
  churchB: z.object({ church: ASSIGN_CHURCH_SCHEMA }),
  churchBMembership: ASSIGN_CHURCH_MEMBERSHIP_SCHEMA,
  cycles: z.object({
    first: ASSIGN_CYCLE_SCHEMA,
    second: ASSIGN_CYCLE_SCHEMA,
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
}: LoadAssignJourneyInput): ActiveChurchSwitchingJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: ACTIVE_CHURCH_SWITCHING_JOURNEY_SCHEMA,
    testInfo,
  });
}
