import * as schema from '@church/db';
import {
  dropDevelopmentSchema,
  migrateDevelopmentSchema,
} from '@church/db/development-database-reset';
import type { CalendarDay } from '@church/time';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { ObjectStorage } from '../../src/domain/contracts/infrastructure/object-storage';
import { runSeedRecipe } from '../recipe';
import {
  createDevelopmentRecipe,
  type DevelopmentRecipeResult,
} from '../recipes/development';
import { loadDevelopmentUpcomingCycle } from '../recipes/development-history';
import type { ReseedPhases } from './reseed';
import { verifyDevelopmentGraph } from './verify';

export interface CreateDevelopmentReseedPhasesInput {
  /** Connected to the target `getDevelopmentDatabaseUrl` resolved. */
  pool: pg.Pool;
  anchor: CalendarDay;
  /** The worktree bucket the seeded logo is uploaded to. */
  objectStorage?: ObjectStorage;
}

export function createDevelopmentReseedPhases({
  pool,
  anchor,
  objectStorage,
}: CreateDevelopmentReseedPhasesInput): ReseedPhases<DevelopmentRecipeResult> {
  const db = drizzle(pool, { schema });

  return {
    reset: () => dropDevelopmentSchema({ pool }),
    migrate: () => migrateDevelopmentSchema({ pool }),
    load: () =>
      runSeedRecipe({
        db,
        recipe: createDevelopmentRecipe({ anchor, objectStorage }),
      }),
    verify: ({ seeded }) => verifyDevelopmentGraph({ db, seeded }),
    // After verification: the graph invariants describe the sent history
    // alone. This sent Cycle is the large one for the suggestion dialog.
    upcoming: async ({ seeded }) => {
      await runSeedRecipe({
        db,
        recipe: {
          name: 'development-upcoming-cycle',
          load: ({ db: tx }) =>
            loadDevelopmentUpcomingCycle({ ...seeded.upcoming, db: tx }),
        },
      });
    },
  };
}
