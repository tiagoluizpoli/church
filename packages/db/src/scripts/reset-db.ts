import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { getDevelopmentDatabaseUrl } from '../development-database-url';

function isPrimaryWorktree(): boolean {
  const [gitDir, commonDir] = execFileSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n');

  return gitDir === commonDir;
}

async function resetDevelopmentDatabase(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Database reset is disabled in production');
  }

  const databaseUrl = getDevelopmentDatabaseUrl({ isPrimaryWorktree });
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
  resetDevelopmentDatabase()
    .then(() => console.log('Development database reset complete.'))
    .catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : 'unknown error';
      console.error(`Development database reset failed: ${reason}`);
      process.exitCode = 1;
    });
}
