import { z } from 'zod';
import {
  ASSIGN_JOURNEY_BASE_SCHEMA,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'public-church-profile';

export const PUBLIC_CHURCH_PROFILE_JOURNEY_SCHEMA =
  ASSIGN_JOURNEY_BASE_SCHEMA.extend({
    oldSlug: z.string().min(1),
    publicContact: z.string().min(1),
    privateContact: z.string().min(1),
    programmeLabel: z.string().min(1),
    movedEvent: z.object({ title: z.string().min(1) }),
    cancelledEvent: z.object({ title: z.string().min(1) }),
  });

export type PublicChurchProfileJourney = z.infer<
  typeof PUBLIC_CHURCH_PROFILE_JOURNEY_SCHEMA
>;

/** Loads this test's own Church; signs nobody in. */
export function loadPublicChurchProfileJourney({
  testInfo,
}: LoadAssignJourneyInput): PublicChurchProfileJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: PUBLIC_CHURCH_PROFILE_JOURNEY_SCHEMA,
    testInfo,
  });
}
