import { z } from 'zod';
import {
  ASSIGN_CYCLE_SCHEMA,
  ASSIGN_JOURNEY_BASE_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  CYCLE_WINDOW_SCHEMA,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'cycle-tenants';

const TENANT_SCHEMA = ASSIGN_JOURNEY_BASE_SCHEMA.pick({
  church: true,
}).extend({
  personas: z.object({ admin: ASSIGN_PERSONA_SCHEMA }),
  cycle: ASSIGN_CYCLE_SCHEMA,
});

export const CYCLE_TENANTS_JOURNEY_SCHEMA = z.object({
  anchor: z.string().min(1),
  cycleWindow: CYCLE_WINDOW_SCHEMA,
  churchA: TENANT_SCHEMA,
  churchB: TENANT_SCHEMA,
});

export type CycleTenantsJourney = z.infer<typeof CYCLE_TENANTS_JOURNEY_SCHEMA>;

/** Loads this test's two Churches, each with its admin and a draft cycle. */
export function loadCycleTenantsJourney({
  testInfo,
}: LoadAssignJourneyInput): CycleTenantsJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: CYCLE_TENANTS_JOURNEY_SCHEMA,
    testInfo,
  });
}
