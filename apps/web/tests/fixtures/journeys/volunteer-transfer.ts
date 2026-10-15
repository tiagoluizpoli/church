import { z } from 'zod';
import {
  ASSIGN_CHURCH_MEMBERSHIP_SCHEMA,
  ASSIGN_CHURCH_SCHEMA,
  ASSIGN_CYCLE_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  assignEventSchema,
  assignMinistrySchema,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'volunteer-transfer';

export const VOLUNTEER_TRANSFER_JOURNEY_SCHEMA = z.object({
  anchor: z.string().min(1),
  churchA: z.object({
    church: ASSIGN_CHURCH_SCHEMA,
    ministries: z.object({
      worship: assignMinistrySchema({ roles: ['usher'], teams: [] }),
    }),
    personas: z.object({ admin: ASSIGN_PERSONA_SCHEMA }),
  }),
  churchB: z.object({
    church: ASSIGN_CHURCH_SCHEMA,
    ministries: z.object({
      hospitality: assignMinistrySchema({ roles: ['porter'], teams: [] }),
    }),
    personas: z.object({
      admin: ASSIGN_PERSONA_SCHEMA,
      transferee: ASSIGN_PERSONA_SCHEMA,
    }),
  }),
  churchAMembership: ASSIGN_CHURCH_MEMBERSHIP_SCHEMA,
  seat: z.object({
    cycle: ASSIGN_CYCLE_SCHEMA,
    event: assignEventSchema({ requirements: ['porter'] }),
    assignmentId: z.string().min(1),
  }),
});

export type VolunteerTransferJourney = z.infer<
  typeof VOLUNTEER_TRANSFER_JOURNEY_SCHEMA
>;

/** Loads this test's own two Churches and transferee; signs nobody in. */
export function loadVolunteerTransferJourney({
  testInfo,
}: LoadAssignJourneyInput): VolunteerTransferJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: VOLUNTEER_TRANSFER_JOURNEY_SCHEMA,
    testInfo,
  });
}
