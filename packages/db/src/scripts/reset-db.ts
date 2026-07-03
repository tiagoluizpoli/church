import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

async function resetDatabase(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Database reset is disabled in production');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

  try {
    await pool.query(
      'DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
    );
    await migrate(drizzle(pool), {
      migrationsFolder: join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        'migrations',
      ),
    });
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  resetDatabase()
    .then(() => console.log('Database reset complete.'))
    .catch((error) => {
      console.error('Database reset failed.', error);
      process.exitCode = 1;
    });
}
