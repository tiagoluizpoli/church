import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/**
 * Creates and migrates managed databases (ADR-0005 bootstrap): rerunnable,
 * never seeds application data, and never drops anything. Concurrent
 * bootstraps against the same PostgreSQL serialize on one advisory lock, so
 * each database is created and migrated exactly once. A failure names its
 * step and database and leaves every completed step in place; a rerun reuses
 * what exists and resumes the rest.
 */

// Held on the admin (`postgres`) connection: advisory locks are scoped to
// the connected database, and every bootstrap connects to that same one.
const PROVISIONING_LOCK_KEY = 7_245_256;
const LOCK_TIMEOUT = '2min';
const ADMIN_DATABASE = 'postgres';
const MANAGED_DATABASE_NAME = /^church[a-z0-9_]*$/;
const DUPLICATE_DATABASE = '42P04';

const MIGRATIONS_FOLDER = join(
  dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

export type ProvisioningStep =
  | 'validate'
  | 'connect'
  | 'lock'
  | 'create'
  | 'migrate';

export interface DatabaseProvisioningErrorInput {
  step: ProvisioningStep;
  database?: string;
  cause: unknown;
}

export class DatabaseProvisioningError extends Error {
  readonly step: ProvisioningStep;
  readonly database: string | undefined;

  constructor(input: DatabaseProvisioningErrorInput) {
    const target = input.database
      ? `${input.step} ${input.database}`
      : input.step;
    const reason =
      input.cause instanceof Error ? input.cause.message : String(input.cause);
    super(`Database provisioning failed at "${target}": ${reason}`, {
      cause: input.cause,
    });
    this.name = 'DatabaseProvisioningError';
    this.step = input.step;
    this.database = input.database;
  }
}

export interface ProvisionDatabasesInput {
  /** Targets on one PostgreSQL server, provisioned in order. */
  databaseUrls: string[];
}

export interface ProvisionedDatabase {
  database: string;
  created: boolean;
}

interface Target {
  url: string;
  database: string;
}

interface StepInput<T> {
  step: ProvisioningStep;
  database?: string;
  run: () => T | Promise<T>;
}

async function withStep<T>(input: StepInput<T>): Promise<T> {
  try {
    return await input.run();
  } catch (error) {
    if (error instanceof DatabaseProvisioningError) throw error;
    throw new DatabaseProvisioningError({
      step: input.step,
      database: input.database,
      cause: error,
    });
  }
}

function validateTargets(input: ProvisionDatabasesInput): Target[] {
  const targets = input.databaseUrls.map((url) => ({
    url,
    database: new URL(url).pathname.slice(1),
  }));
  const servers = new Set(
    input.databaseUrls.map((url) => {
      const { username, host } = new URL(url);
      return `${username}@${host}`;
    }),
  );

  if (servers.size !== 1) {
    throw new Error(
      'Provide at least one target, all on the same PostgreSQL server.',
    );
  }

  for (const { database } of targets) {
    if (!MANAGED_DATABASE_NAME.test(database)) {
      throw new Error(
        `"${database}" is outside the managed "church" database namespace.`,
      );
    }
  }

  return targets;
}

/** The SQLSTATE a `pg` query error carries. */
interface PostgresError {
  code?: string;
}

interface AdminInput {
  admin: pg.Client;
  target: Target;
}

async function createDatabase(input: AdminInput): Promise<boolean> {
  const existing = await input.admin.query(
    'select 1 from pg_database where datname = $1',
    [input.target.database],
  );
  if (existing.rowCount === 1) return false;

  try {
    // Safe to interpolate: validateTargets allows only [a-z0-9_] names.
    await input.admin.query(`create database "${input.target.database}"`);
    return true;
  } catch (error) {
    if ((error as PostgresError).code === DUPLICATE_DATABASE) return false;
    throw error;
  }
}

interface MigrateInput {
  target: Target;
}

async function migrateDatabase(input: MigrateInput): Promise<void> {
  const pool = new pg.Pool({ connectionString: input.target.url, max: 1 });

  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

export async function provisionDatabases(
  input: ProvisionDatabasesInput,
): Promise<ProvisionedDatabase[]> {
  const targets = await withStep({
    step: 'validate',
    run: () => validateTargets(input),
  });
  const adminUrl = new URL(targets[0]?.url ?? '');
  adminUrl.pathname = `/${ADMIN_DATABASE}`;
  const admin = new pg.Client({ connectionString: adminUrl.toString() });

  try {
    await withStep({ step: 'connect', run: () => admin.connect() });
    await withStep({
      step: 'lock',
      run: async () => {
        // Bounded: a stuck bootstrap must not block every worktree forever.
        await admin.query(`set lock_timeout = '${LOCK_TIMEOUT}'`);
        await admin.query('select pg_advisory_lock($1)', [
          PROVISIONING_LOCK_KEY,
        ]);
      },
    });

    const provisioned: ProvisionedDatabase[] = [];

    for (const target of targets) {
      const created = await withStep({
        step: 'create',
        database: target.database,
        run: () => createDatabase({ admin, target }),
      });
      await withStep({
        step: 'migrate',
        database: target.database,
        run: () => migrateDatabase({ target }),
      });
      provisioned.push({ database: target.database, created });
    }

    return provisioned;
  } finally {
    // Closing the session also releases the advisory lock; a close failure
    // must not mask the step that failed.
    await admin.end().catch(() => {});
  }
}
