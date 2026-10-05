import { test as base, expect, type TestInfo } from '@playwright/test';
import { z } from 'zod';
import { parseLastJsonLine, runE2eServerScript } from './e2e-target';
import { resolveActiveChurch, signInPersona } from './persona-session';

/**
 * Journey recipes (#327): a journey that mutates domain data builds its own
 * Church graph and persona through an `apps/server` recipe script, instead of
 * borrowing the shared seed.
 *
 * Layering:
 * - `tests/global-setup.ts` owns the shared personas and their storageState.
 *   Their identities and sessions are read-only, but the domain data reachable
 *   through them is still mutated by the `shared-seed` lane (see
 *   e2e-lanes.ts); journey recipes are how a journey stops depending on it.
 * - A journey recipe owns MUTABLE domain data plus its own persona, scoped to
 *   one test. Nothing here reads or writes another specification's data, so
 *   the spec can run in the parallel `isolated` lane.
 */

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const VOLUNTEER_ASSIGNMENTS_RECIPE = 'volunteer-assignments';

export const VOLUNTEER_ASSIGNMENTS_JOURNEY_SCHEMA = z.object({
  anchor: z.string().min(1),
  church: z.object({ id: z.string().min(1), slug: z.string().min(1) }),
  volunteer: z.object({
    userId: z.string().min(1),
    email: z.string().min(1),
    password: z.string().min(1),
    name: z.string().min(1),
    volunteerId: z.string().min(1),
  }),
  assignment: z.object({
    id: z.string().min(1),
    eventId: z.string().min(1),
    eventTitle: z.string().min(1),
    ministryName: z.string().min(1),
    roleName: z.string().min(1),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
  }),
});

export type VolunteerAssignmentsJourney = z.infer<
  typeof VOLUNTEER_ASSIGNMENTS_JOURNEY_SCHEMA
>;

interface JourneyKeyInput {
  testId: string;
  repeatEachIndex: number;
}

/**
 * Unique per test across workers; a retry reuses it, so the recipe recreates
 * the same graph (same key, same ids).
 */
export function journeyKeyOf({
  testId,
  repeatEachIndex,
}: JourneyKeyInput): string {
  return `${testId}-${repeatEachIndex}`;
}

export interface LoadJourneyRecipeInput<TSchema extends z.ZodType> {
  recipeName: string;
  schema: TSchema;
  testInfo: Pick<TestInfo, 'testId' | 'repeatEachIndex'>;
}

/**
 * Runs the server recipe loader for this test's journey key and validates its
 * JSON result. Does not sign anyone in: a journey signs in whichever personas
 * it needs, each on its own context.
 */
export function loadJourneyRecipe<TSchema extends z.ZodType>({
  recipeName,
  schema,
  testInfo,
}: LoadJourneyRecipeInput<TSchema>): z.infer<TSchema> {
  const journeyKey = journeyKeyOf({
    testId: testInfo.testId,
    repeatEachIndex: testInfo.repeatEachIndex,
  });
  const output = runE2eServerScript({
    scriptPath: 'seeds/e2e/load-journey-recipe.ts',
    args: [recipeName, `--key=${journeyKey}`],
    step: `load ${recipeName} journey recipe`,
  });
  return parseLastJsonLine({ output, schema });
}

interface JourneyRecipeFixtures {
  volunteerAssignmentsJourney: VolunteerAssignmentsJourney;
}

export const test = base.extend<JourneyRecipeFixtures>({
  volunteerAssignmentsJourney: async ({ page }, use, testInfo) => {
    const journey = loadJourneyRecipe({
      recipeName: VOLUNTEER_ASSIGNMENTS_RECIPE,
      schema: VOLUNTEER_ASSIGNMENTS_JOURNEY_SCHEMA,
      testInfo,
    });
    const request = page.context().request;

    await signInPersona({ request, credentials: journey.volunteer });
    await resolveActiveChurch({ request, name: journey.volunteer.name });

    await use(journey);
  },
});

export { expect };
