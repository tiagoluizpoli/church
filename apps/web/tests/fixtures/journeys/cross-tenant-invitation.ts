import { z } from 'zod';
import {
  ASSIGN_CHURCH_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  assignMinistrySchema,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'cross-tenant-invitation';

const TENANT_SCHEMA = z.object({
  church: ASSIGN_CHURCH_SCHEMA,
  ministries: z.object({
    worship: assignMinistrySchema({ roles: [], teams: [] }),
  }),
  personas: z.object({ admin: ASSIGN_PERSONA_SCHEMA }),
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
}: LoadAssignJourneyInput): CrossTenantInvitationJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: CROSS_TENANT_INVITATION_JOURNEY_SCHEMA,
    testInfo,
  });
}
