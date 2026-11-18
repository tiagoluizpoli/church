import pg from 'pg';
import {
  dropDevelopmentSchema,
  migrateDevelopmentSchema,
} from '../development-database-reset';
import { getDevelopmentDatabaseUrl } from '../development-database-url';

async function resetDevelopmentDatabase(): Promise<void> {
  const databaseUrl = getDevelopmentDatabaseUrl();
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

  try {
    await dropDevelopmentSchema({ pool });
    await migrateDevelopmentSchema({ pool });
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  resetDevelopmentDatabase()
    .then(() => console.log('Development database reset complete.'))
    .catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : 'unknown error';
      console.error(`Development database reset failed: ${reason}`);
      process.exitCode = 1;
    });
}
