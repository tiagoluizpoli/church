import { z } from 'zod';
import {
  ASSIGN_CYCLE_SCHEMA,
  ASSIGN_JOURNEY_BASE_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  ASSIGN_POOL_VOLUNTEER_SCHEMA,
  assignMinistrySchema,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'schedule-publish';

const PARTICIPATION_SCHEMA = z.object({
  id: z.string().min(1),
  shiftId: z.string().min(1),
});

export const SCHEDULE_PUBLISH_JOURNEY_SCHEMA =
  ASSIGN_JOURNEY_BASE_SCHEMA.extend({
    ministries: z.object({
      worship: assignMinistrySchema({ roles: ['usher'], teams: [] }),
      care: assignMinistrySchema({ roles: ['careHost'], teams: ['care'] }),
    }),
    personas: z.object({
      leader: ASSIGN_PERSONA_SCHEMA,
      volunteer: ASSIGN_PERSONA_SCHEMA,
    }),
    pool: z.object({ other: ASSIGN_POOL_VOLUNTEER_SCHEMA }),
    cycle: ASSIGN_CYCLE_SCHEMA,
    event: z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      startsAt: z.string().min(1),
    }),
    worship: PARTICIPATION_SCHEMA.extend({ requiredCount: z.number() }),
    care: PARTICIPATION_SCHEMA,
  });

export type SchedulePublishJourney = z.infer<
  typeof SCHEDULE_PUBLISH_JOURNEY_SCHEMA
>;

/** Loads this test's own graph; signs nobody in. */
export function loadSchedulePublishJourney({
  testInfo,
}: LoadAssignJourneyInput): SchedulePublishJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: SCHEDULE_PUBLISH_JOURNEY_SCHEMA,
    testInfo,
  });
}
