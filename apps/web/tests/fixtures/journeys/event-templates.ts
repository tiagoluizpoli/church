import { z } from 'zod';
import {
  ASSIGN_JOURNEY_BASE_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const EVENT_TEMPLATES_RECIPE_NAME = 'event-templates';

export const EVENT_TEMPLATES_JOURNEY_SCHEMA = ASSIGN_JOURNEY_BASE_SCHEMA.extend(
  {
    personas: z.object({ admin: ASSIGN_PERSONA_SCHEMA }),
    /** The seeded templates, in alphabetical (list) order. */
    templates: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        weekday: z.number().int().min(0).max(6),
        blockCount: z.number().int().min(1),
      }),
    ),
  },
);

export type EventTemplatesJourney = z.infer<
  typeof EVENT_TEMPLATES_JOURNEY_SCHEMA
>;

/** Loads this test's own Church, its ChurchAdmin and two seeded templates (no
 * Cycle, no Ministry); signs nobody in. */
export function loadEventTemplatesJourney({
  testInfo,
}: LoadAssignJourneyInput): EventTemplatesJourney {
  return loadJourneyRecipe({
    recipeName: EVENT_TEMPLATES_RECIPE_NAME,
    schema: EVENT_TEMPLATES_JOURNEY_SCHEMA,
    testInfo,
  });
}
