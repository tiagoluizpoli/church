import { z } from 'zod';
import { loadJourneyRecipe } from '../journey-recipes';
import {
  type LoadRosteringJourneyInput,
  ROSTERING_CHURCH_MEMBERSHIP_SCHEMA,
  ROSTERING_CHURCH_SCHEMA,
  ROSTERING_CYCLE_SCHEMA,
  ROSTERING_PERSONA_SCHEMA,
  rosteringEventSchema,
  rosteringMinistrySchema,
} from './rostering-church';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'volunteer-transfer';

export const VOLUNTEER_TRANSFER_JOURNEY_SCHEMA = z.object({
  anchor: z.string().min(1),
  churchA: z.object({
    church: ROSTERING_CHURCH_SCHEMA,
    ministries: z.object({
      worship: rosteringMinistrySchema({ roles: ['usher'], teams: [] }),
    }),
    personas: z.object({ admin: ROSTERING_PERSONA_SCHEMA }),
  }),
  churchB: z.object({
    church: ROSTERING_CHURCH_SCHEMA,
    ministries: z.object({
      hospitality: rosteringMinistrySchema({ roles: ['porter'], teams: [] }),
    }),
    personas: z.object({
      admin: ROSTERING_PERSONA_SCHEMA,
      transferee: ROSTERING_PERSONA_SCHEMA,
    }),
  }),
  churchAMembership: ROSTERING_CHURCH_MEMBERSHIP_SCHEMA,
  seat: z.object({
    cycle: ROSTERING_CYCLE_SCHEMA,
    event: rosteringEventSchema({ requirements: ['porter'] }),
    assignmentId: z.string().min(1),
  }),
});

export type VolunteerTransferJourney = z.infer<
  typeof VOLUNTEER_TRANSFER_JOURNEY_SCHEMA
>;

/** Loads this test's own two Churches and transferee; signs nobody in. */
export function loadVolunteerTransferJourney({
  testInfo,
}: LoadRosteringJourneyInput): VolunteerTransferJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: VOLUNTEER_TRANSFER_JOURNEY_SCHEMA,
    testInfo,
  });
}
