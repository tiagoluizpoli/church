import { z } from 'zod';
import {
  ASSIGN_JOURNEY_BASE_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  assignEventSchema,
  assignMinistrySchema,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'volunteer-dashboard';

export const VOLUNTEER_DASHBOARD_JOURNEY_SCHEMA =
  ASSIGN_JOURNEY_BASE_SCHEMA.extend({
    ministries: z.object({
      worship: assignMinistrySchema({ roles: ['usher'], teams: [] }),
      care: assignMinistrySchema({ roles: ['careHost'], teams: ['care'] }),
    }),
    personas: z.object({
      leader: ASSIGN_PERSONA_SCHEMA,
      volunteer: ASSIGN_PERSONA_SCHEMA,
    }),
    careEvent: assignEventSchema({ requirements: ['careHost'] }),
    availabilityEvent: assignEventSchema({ requirements: ['usher'] }),
    removedEvent: assignEventSchema({ requirements: ['usher'] }),
    notification: z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      createdAt: z.string().min(1),
    }),
  });

export type VolunteerDashboardJourney = z.infer<
  typeof VOLUNTEER_DASHBOARD_JOURNEY_SCHEMA
>;

/** Loads this test's own graph; signs nobody in. */
export function loadVolunteerDashboardJourney({
  testInfo,
}: LoadAssignJourneyInput): VolunteerDashboardJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: VOLUNTEER_DASHBOARD_JOURNEY_SCHEMA,
    testInfo,
  });
}
