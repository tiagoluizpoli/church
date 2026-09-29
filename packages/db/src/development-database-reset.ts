import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type pg from 'pg';

const MIGRATIONS_FOLDER = join(
  dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

/** The primary checkout is the `develop` worktree; a linked worktree's git
 * dir differs from the common dir. */
export function isPrimaryWorktree(): boolean {
  const [gitDir, commonDir] = execFileSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n');

  return gitDir === commonDir;
}

export interface DevelopmentDatabasePoolInput {
  /** Connected to a target `getDevelopmentDatabaseUrl` already resolved. */
  pool: pg.Pool;
}

/** Drops every application table and the migration journal. Destructive:
 * callers resolve the target through `getDevelopmentDatabaseUrl` first. */
export async function dropDevelopmentSchema({
  pool,
}: DevelopmentDatabasePoolInput): Promise<void> {
  await pool.query(
    'DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
  );
}

export async function migrateDevelopmentSchema({
  pool,
}: DevelopmentDatabasePoolInput): Promise<void> {
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
}
