import { z } from 'zod';
import { loadJourneyRecipe } from '../journey-recipes';
import {
  type LoadRosteringJourneyInput,
  ROSTERING_CYCLE_SCHEMA,
  ROSTERING_JOURNEY_BASE_SCHEMA,
  ROSTERING_PERSONA_SCHEMA,
  rosteringEventSchema,
  rosteringMinistrySchema,
} from './rostering-church';

// Mirrors the server's `E2E_JOURNEY_RECIPE_NAMES`
// (apps/server/seeds/e2e/journey-keys.ts); web cannot import server code.
const RECIPE_NAME = 'rostering-board';

const ROSTERED_ASSIGNMENT_SCHEMA = z.object({
  id: z.string().min(1),
  volunteerId: z.string().min(1),
  status: z.enum(['pending', 'confirmed', 'declined']),
});

export const ROSTERING_BOARD_JOURNEY_SCHEMA =
  ROSTERING_JOURNEY_BASE_SCHEMA.extend({
    cycle: ROSTERING_CYCLE_SCHEMA,
    ministries: z.object({
      worship: rosteringMinistrySchema({
        roles: ['usher', 'greeter', 'host'],
        teams: ['alpha'],
      }),
    }),
    personas: z.object({ leader: ROSTERING_PERSONA_SCHEMA }),
    events: z.object({
      service: rosteringEventSchema({ requirements: ['usher'] }),
      teamService: rosteringEventSchema({
        requirements: ['greeter', 'usher'],
      }),
      /** Read-only: a pending, a confirmed and a declined Host. */
      rosteredService: rosteringEventSchema({ requirements: ['host'] }).extend({
        assignments: z.array(ROSTERED_ASSIGNMENT_SCHEMA).length(3),
      }),
    }),
  });

export type RosteringBoardJourney = z.infer<
  typeof ROSTERING_BOARD_JOURNEY_SCHEMA
>;

/** Loads this test's own cycle board; signs nobody in. */
export function loadRosteringBoardJourney({
  testInfo,
}: LoadRosteringJourneyInput): RosteringBoardJourney {
  return loadJourneyRecipe({
    recipeName: RECIPE_NAME,
    schema: ROSTERING_BOARD_JOURNEY_SCHEMA,
    testInfo,
  });
}
