import { z } from 'zod';
import {
  ASSIGN_CYCLE_SCHEMA,
  ASSIGN_JOURNEY_BASE_SCHEMA,
  ASSIGN_PERSONA_SCHEMA,
  assignEventSchema,
  assignMinistrySchema,
  type LoadAssignJourneyInput,
} from './assign-church';
import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'assign-board';

const ASSIGNED_ASSIGNMENT_SCHEMA = z.object({
  id: z.string().min(1),
  volunteerId: z.string().min(1),
  status: z.enum(['pending', 'confirmed', 'declined']),
});

export const ASSIGN_BOARD_JOURNEY_SCHEMA = ASSIGN_JOURNEY_BASE_SCHEMA.extend({
  cycle: ASSIGN_CYCLE_SCHEMA,
  ministries: z.object({
    worship: assignMinistrySchema({
      roles: ['usher', 'greeter', 'host'],
      teams: ['alpha'],
    }),
  }),
  personas: z.object({ leader: ASSIGN_PERSONA_SCHEMA }),
  events: z.object({
    service: assignEventSchema({ requirements: ['usher'] }),
    teamService: assignEventSchema({
      requirements: ['greeter', 'usher'],
    }),
    /** Read-only: a pending, a confirmed and a declined Host. */
    assignedService: assignEventSchema({ requirements: ['host'] }).extend({
      assignments: z.array(ASSIGNED_ASSIGNMENT_SCHEMA).length(3),
    }),
  }),
});

export type AssignBoardJourney = z.infer<typeof ASSIGN_BOARD_JOURNEY_SCHEMA>;

/** Loads this test's own cycle board; signs nobody in. */
export function loadAssignBoardJourney({
  testInfo,
}: LoadAssignJourneyInput): AssignBoardJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: ASSIGN_BOARD_JOURNEY_SCHEMA,
    testInfo,
  });
}
