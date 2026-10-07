import { z } from 'zod';
import { loadJourneyRecipe } from '../journey-recipes';
import {
  type LoadRosteringJourneyInput,
  ROSTERING_JOURNEY_BASE_SCHEMA,
  ROSTERING_PERSONA_SCHEMA,
  rosteringEventSchema,
  rosteringMinistrySchema,
} from './rostering-church';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'volunteer-dashboard';

export const VOLUNTEER_DASHBOARD_JOURNEY_SCHEMA =
  ROSTERING_JOURNEY_BASE_SCHEMA.extend({
    ministries: z.object({
      worship: rosteringMinistrySchema({ roles: ['usher'], teams: [] }),
      care: rosteringMinistrySchema({ roles: ['careHost'], teams: ['care'] }),
    }),
    personas: z.object({
      leader: ROSTERING_PERSONA_SCHEMA,
      volunteer: ROSTERING_PERSONA_SCHEMA,
    }),
    careEvent: rosteringEventSchema({ requirements: ['careHost'] }),
    availabilityEvent: rosteringEventSchema({ requirements: ['usher'] }),
    removedEvent: rosteringEventSchema({ requirements: ['usher'] }),
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
}: LoadRosteringJourneyInput): VolunteerDashboardJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: VOLUNTEER_DASHBOARD_JOURNEY_SCHEMA,
    testInfo,
  });
}
