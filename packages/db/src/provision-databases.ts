import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { isIntegrationWorkerDatabaseName } from './integration-worker-database-name';

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
export const PROVISIONING_LOCK_KEY = 7_245_256;
const LOCK_TIMEOUT = '2min';
const ADMIN_DATABASE = 'postgres';
const MANAGED_DATABASE_NAME = /^church[a-z0-9_]*$/;
const OBJECT_IN_USE = '55006';
const POSTGRES_IDENTIFIER_LIMIT = 63;
const DUPLICATE_DATABASE = '42P04';
const UNDEFINED_TABLE = '42P01';
const INVALID_SCHEMA_NAME = '3F000';

const MIGRATIONS_FOLDER = join(
  dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

export type ProvisioningStep =
  | 'validate'
  | 'connect'
  | 'lock'
  | 'verify'
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

export interface CloneDatabasesFromTemplateInput {
  /** Migrated database on the local PostgreSQL server. */
  templateUrl: string;
  /** New managed database names on that same server. */
  databaseNames: string[];
}

export interface ClonedDatabase {
  database: string;
  /** Whether a prior worker database had to be removed first. */
  replaced: boolean;
}

interface Target {
  url: string;
  database: string;
}

function databaseNameFromUrl(url: string): string {
  return new URL(url).pathname.slice(1);
}

function assertManagedDatabaseName(database: string): void {
  if (!MANAGED_DATABASE_NAME.test(database)) {
    throw new Error(
      `"${database}" is outside the managed "church" database namespace.`,
    );
  }
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
    assertManagedDatabaseName(database);
  }

  return targets;
}

/** The SQLSTATE a `pg` query error carries. */
interface PostgresError {
  code?: string;
}

interface CloneDatabaseInput {
  admin: pg.Client;
  templateDatabase: string;
  database: string;
}

async function cloneDatabase(
  input: CloneDatabaseInput,
): Promise<ClonedDatabase> {
  const { admin, templateDatabase, database } = input;
  const existing = await admin.query(
    'select 1 from pg_database where datname = $1',
    [database],
  );
  await admin.query(`drop database if exists "${database}" with (force)`);
  try {
    await admin.query(
      `create database "${database}" template "${templateDatabase}"`,
    );
  } catch (error) {
    // PostgreSQL refuses to copy a template that has other sessions connected.
    if ((error as PostgresError).code === OBJECT_IN_USE) {
      throw new Error(
        `The template "${templateDatabase}" has other connections open, so it cannot be cloned. Stop whatever is connected to it (a running integration test, dev server or psql session) and rerun.`,
        { cause: error },
      );
    }
    throw error;
  }
  return { database, replaced: existing.rowCount === 1 };
}

interface LockInput {
  admin: pg.Client;
}

async function acquireProvisioningLock(input: LockInput): Promise<void> {
  // Bounded: a stuck bootstrap must not block every worktree forever.
  await input.admin.query(`set lock_timeout = '${LOCK_TIMEOUT}'`);
  await input.admin.query('select pg_advisory_lock($1)', [
    PROVISIONING_LOCK_KEY,
  ]);
}

/**
 * Replaces worker databases with PostgreSQL template clones. The template is
 * already migrated, so every worker starts from the same schema without a
 * migration pass of its own.
 */
export async function cloneDatabasesFromTemplate(
  input: CloneDatabasesFromTemplateInput,
): Promise<ClonedDatabase[]> {
  const templateDatabase = databaseNameFromUrl(input.templateUrl);
  assertManagedDatabaseName(templateDatabase);

  for (const database of input.databaseNames) {
    if (
      !isIntegrationWorkerDatabaseName({ database }) ||
      database.length > POSTGRES_IDENTIFIER_LIMIT
    ) {
      throw new Error(
        `"${database}" is not a valid integration worker database name.`,
      );
    }
  }

  if (input.databaseNames.includes(templateDatabase)) {
    throw new Error('A database cannot be cloned from itself as a template.');
  }

  const adminUrl = new URL(input.templateUrl);
  adminUrl.pathname = `/${ADMIN_DATABASE}`;
  const admin = new pg.Client({ connectionString: adminUrl.toString() });

  try {
    await withStep({ step: 'connect', run: () => admin.connect() });
    await withStep({
      step: 'lock',
      run: () => acquireProvisioningLock({ admin }),
    });
    await withStep({
      step: 'verify',
      run: () =>
        assertTemplateMatchesBranch({ templateUrl: input.templateUrl }),
    });
    const clones: ClonedDatabase[] = [];

    for (const database of input.databaseNames) {
      clones.push(
        await withStep({
          step: 'create',
          database,
          run: () => cloneDatabase({ admin, templateDatabase, database }),
        }),
      );
    }

    return clones;
  } finally {
    // Closing the session also releases the advisory lock.
    await admin.end().catch(() => {});
  }
}

interface ExpectedMigration {
  /** Ledger identity: drizzle records `created_at` and a content hash. */
  key: string;
  label: string;
}

function expectedMigrations(): ExpectedMigration[] {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: { when: number; tag: string }[] };
  const tags = new Map(journal.entries.map((e) => [e.when, e.tag]));
  return readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER }).map(
    (migration) => ({
      key: `${migration.folderMillis}:${migration.hash}`,
      label: tags.get(migration.folderMillis) ?? String(migration.folderMillis),
    }),
  );
}

function testedRevision(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

interface TemplateInput {
  templateUrl: string;
}

/** Credentials stripped: host, port and database only. */
function redactedIdentity(input: TemplateInput): string {
  const { host, pathname } = new URL(input.templateUrl);
  return `${host}${pathname}`;
}

/**
 * Read-only: compares the template's migration ledger with this branch's
 * migration files entry by entry (counts alone cannot tell branches apart)
 * and fails before anything is cloned. It never migrates or downgrades.
 */
async function assertTemplateMatchesBranch(
  input: TemplateInput,
): Promise<void> {
  const client = new pg.Client({ connectionString: input.templateUrl });
  let applied: string[];
  await client.connect();
  try {
    const result = await client.query(
      'select created_at, hash from drizzle.__drizzle_migrations',
    );
    applied = result.rows.map((row) => `${row.created_at}:${row.hash}`);
  } catch (error) {
    const code = (error as PostgresError).code;
    if (code !== UNDEFINED_TABLE && code !== INVALID_SCHEMA_NAME) throw error;
    applied = [];
  } finally {
    // An open session would also make the template uncloneable.
    await client.end();
  }

  const expected = expectedMigrations();
  const appliedSet = new Set(applied);
  const expectedKeys = new Set(expected.map((migration) => migration.key));
  const missing = expected.filter((m) => !appliedSet.has(m.key));
  const unexpected = applied.filter((key) => !expectedKeys.has(key));
  if (missing.length === 0 && unexpected.length === 0) return;

  throw new Error(
    [
      `The template ${redactedIdentity(input)} does not match the migrations of the tested revision ${testedRevision()}.`,
      `Expected ${expected.length} migrations, template has applied ${applied.length}.`,
      `Missing from the template: ${missing.map((m) => m.label).join(', ') || 'none'}.`,
      `Applied but unknown to this branch: ${unexpected.length === 0 ? 'none' : `${unexpected.length} (migrated by another branch)`}.`,
      'Remediation: run `bun run db:bootstrap` to apply missing migrations; if the template is ahead of or diverged from this branch, recreate it from a branch-matching setup. Shared databases are never downgraded.',
    ].join('\n'),
  );
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
    // pool.end() resolves before its client's socket closes, so a later force-drop can still kill that client (57P01).
    pool.on('error', () => {});
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
      run: () => acquireProvisioningLock({ admin }),
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
