import { z } from 'zod';
import {
  ASSIGN_CYCLE_SCHEMA,
  ASSIGN_JOURNEY_BASE_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  assignMinistrySchema,
  CYCLE_WINDOW_SCHEMA,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const PLANNING_ADMIN_RECIPE_NAME = 'planning-admin';
const CYCLE_ACCESS_RECIPE_NAME = 'cycle-access';

const PLANNING_ADMIN_FIELDS = {
  cycleWindow: CYCLE_WINDOW_SCHEMA,
  ministries: z.object({
    worship: assignMinistrySchema({ roles: ['usher'], teams: [] }),
  }),
  personas: z.object({
    admin: ASSIGN_PERSONA_SCHEMA,
    volunteer: ASSIGN_PERSONA_SCHEMA,
  }),
};

export const PLANNING_ADMIN_JOURNEY_SCHEMA = ASSIGN_JOURNEY_BASE_SCHEMA.extend(
  PLANNING_ADMIN_FIELDS,
);

export type PlanningAdminJourney = z.infer<
  typeof PLANNING_ADMIN_JOURNEY_SCHEMA
>;

/** Loads this test's own Church, ChurchAdmin and Volunteer; no Cycle,
 * and signs nobody in. */
export function loadPlanningAdminJourney({
  testInfo,
}: LoadAssignJourneyInput): PlanningAdminJourney {
  return loadJourneyRecipe({
    recipeName: PLANNING_ADMIN_RECIPE_NAME,
    schema: PLANNING_ADMIN_JOURNEY_SCHEMA,
    testInfo,
  });
}

export const CYCLE_ACCESS_JOURNEY_SCHEMA = ASSIGN_JOURNEY_BASE_SCHEMA.extend({
  ...PLANNING_ADMIN_FIELDS,
  /** A sent cycle, read-only for every journey. */
  cycle: ASSIGN_CYCLE_SCHEMA,
});

export type CycleAccessJourney = z.infer<typeof CYCLE_ACCESS_JOURNEY_SCHEMA>;

/** Loads the planning-admin Church plus its own sent Cycle. */
export function loadCycleAccessJourney({
  testInfo,
}: LoadAssignJourneyInput): CycleAccessJourney {
  return loadJourneyRecipe({
    recipeName: CYCLE_ACCESS_RECIPE_NAME,
    schema: CYCLE_ACCESS_JOURNEY_SCHEMA,
    testInfo,
  });
}
