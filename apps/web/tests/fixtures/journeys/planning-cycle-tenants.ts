import { z } from 'zod';
import { loadJourneyRecipe } from '../journey-recipes';
import {
  type LoadRosteringJourneyInput,
  PLANNING_CYCLE_WINDOW_SCHEMA,
  ROSTERING_CYCLE_SCHEMA,
  ROSTERING_JOURNEY_BASE_SCHEMA,
  ROSTERING_PERSONA_SCHEMA,
} from './rostering-church';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'planning-cycle-tenants';

const TENANT_SCHEMA = ROSTERING_JOURNEY_BASE_SCHEMA.pick({
  church: true,
}).extend({
  personas: z.object({ admin: ROSTERING_PERSONA_SCHEMA }),
  cycle: ROSTERING_CYCLE_SCHEMA,
});

export const PLANNING_CYCLE_TENANTS_JOURNEY_SCHEMA = z.object({
  anchor: z.string().min(1),
  cycleWindow: PLANNING_CYCLE_WINDOW_SCHEMA,
  churchA: TENANT_SCHEMA,
  churchB: TENANT_SCHEMA,
});

export type PlanningCycleTenantsJourney = z.infer<
  typeof PLANNING_CYCLE_TENANTS_JOURNEY_SCHEMA
>;

/** Loads this test's two Churches, each with its admin and a draft cycle. */
export function loadPlanningCycleTenantsJourney({
  testInfo,
}: LoadRosteringJourneyInput): PlanningCycleTenantsJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: PLANNING_CYCLE_TENANTS_JOURNEY_SCHEMA,
    testInfo,
  });
}
