import { z } from 'zod';
import { loadJourneyRecipe } from '../journey-recipes';
import {
  type LoadRosteringJourneyInput,
  ROSTERING_CHURCH_SCHEMA,
  ROSTERING_PERSONA_SCHEMA,
  rosteringMinistrySchema,
} from './rostering-church';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'cross-tenant-invitation';

const TENANT_SCHEMA = z.object({
  church: ROSTERING_CHURCH_SCHEMA,
  ministries: z.object({
    worship: rosteringMinistrySchema({ roles: [], teams: [] }),
  }),
  personas: z.object({ admin: ROSTERING_PERSONA_SCHEMA }),
});

export const CROSS_TENANT_INVITATION_JOURNEY_SCHEMA = z.object({
  churchA: TENANT_SCHEMA,
  churchB: TENANT_SCHEMA,
  emails: z.object({
    probe: z.string().min(1),
    target: z.string().min(1),
  }),
});

export type CrossTenantInvitationJourney = z.infer<
  typeof CROSS_TENANT_INVITATION_JOURNEY_SCHEMA
>;

/** Loads this test's own graph; signs nobody in. */
export function loadCrossTenantInvitationJourney({
  testInfo,
}: LoadRosteringJourneyInput): CrossTenantInvitationJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: CROSS_TENANT_INVITATION_JOURNEY_SCHEMA,
    testInfo,
  });
}
