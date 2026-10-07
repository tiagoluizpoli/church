import { z } from 'zod';
import { loadJourneyRecipe } from '../journey-recipes';
import {
  type LoadRosteringJourneyInput,
  PLANNING_CYCLE_WINDOW_SCHEMA,
  ROSTERING_CYCLE_SCHEMA,
  ROSTERING_JOURNEY_BASE_SCHEMA,
  ROSTERING_PERSONA_SCHEMA,
  rosteringMinistrySchema,
} from './rostering-church';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const PLANNING_ADMIN_RECIPE_NAME = 'planning-admin';
const PLANNING_CYCLE_ACCESS_RECIPE_NAME = 'planning-cycle-access';

const PLANNING_ADMIN_FIELDS = {
  cycleWindow: PLANNING_CYCLE_WINDOW_SCHEMA,
  ministries: z.object({
    worship: rosteringMinistrySchema({ roles: ['usher'], teams: [] }),
  }),
  personas: z.object({
    admin: ROSTERING_PERSONA_SCHEMA,
    volunteer: ROSTERING_PERSONA_SCHEMA,
  }),
};

export const PLANNING_ADMIN_JOURNEY_SCHEMA =
  ROSTERING_JOURNEY_BASE_SCHEMA.extend(PLANNING_ADMIN_FIELDS);

export type PlanningAdminJourney = z.infer<
  typeof PLANNING_ADMIN_JOURNEY_SCHEMA
>;

/** Loads this test's own Church, ChurchAdmin and Volunteer; no PlanningCycle,
 * and signs nobody in. */
export function loadPlanningAdminJourney({
  testInfo,
}: LoadRosteringJourneyInput): PlanningAdminJourney {
  return loadJourneyRecipe({
    recipeName: PLANNING_ADMIN_RECIPE_NAME,
    schema: PLANNING_ADMIN_JOURNEY_SCHEMA,
    testInfo,
  });
}

export const PLANNING_CYCLE_ACCESS_JOURNEY_SCHEMA =
  ROSTERING_JOURNEY_BASE_SCHEMA.extend({
    ...PLANNING_ADMIN_FIELDS,
    /** A locked cycle, read-only for every journey. */
    cycle: ROSTERING_CYCLE_SCHEMA,
  });

export type PlanningCycleAccessJourney = z.infer<
  typeof PLANNING_CYCLE_ACCESS_JOURNEY_SCHEMA
>;

/** Loads the planning-admin Church plus its own locked PlanningCycle. */
export function loadPlanningCycleAccessJourney({
  testInfo,
}: LoadRosteringJourneyInput): PlanningCycleAccessJourney {
  return loadJourneyRecipe({
    recipeName: PLANNING_CYCLE_ACCESS_RECIPE_NAME,
    schema: PLANNING_CYCLE_ACCESS_JOURNEY_SCHEMA,
    testInfo,
  });
}
