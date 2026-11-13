import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import * as schema from '@church/db';
import { now, today } from '@church/time';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { DEVELOPMENT_CHURCH_TIMEZONE } from '../blueprints/development';
import { verifyDevelopmentGraph } from '../development/verify';
import { runSeedRecipe } from '../recipe';
import { createDevelopmentRecipe } from '../recipes/development';

const RESET_MODES = ['demo', 'clean'] as const;
type ResetMode = (typeof RESET_MODES)[number];

const RESETTABLE_ENVIRONMENTS = ['development', 'staging'] as const;
type ResettableEnvironment = (typeof RESETTABLE_ENVIRONMENTS)[number];

/** Operator configuration a reset keeps; every other `public` table is emptied. */
export const PRESERVED_TABLES = ['runtime_configuration'];

/** The deployed server's connections carry this name (deployment/compose.yml PGAPPNAME). */
export const SERVER_APPLICATION_NAME = 'church-server';
const RESET_APPLICATION_NAME = 'church-reset';

const USAGE =
  'Usage: environment:reset <demo|clean> --environment <development|staging>';

export interface BackupTarget {
  environment: ResettableEnvironment;
  database: string;
}

/** Mailpit, the environment's captured-message inbox. */
export interface CapturedMessages {
  /** Fails when the inbox cannot be reached, before anything is destroyed. */
  assertReachable(): Promise<void>;
  deleteAll(): Promise<void>;
}

export interface ResetEnvironmentInput {
  /** Connected to the environment's own database. */
  pool: pg.Pool;
  argv: string[];
  /** The environment this process is actually deployed in (CHURCH_ENVIRONMENT). */
  runtimeEnvironment: string;
  /** Resolves only once the target backup has succeeded. */
  backup: (target: BackupTarget) => Promise<void>;
  capturedMessages: CapturedMessages;
}

export interface ResetEnvironmentResult {
  mode: ResetMode;
  environment: ResettableEnvironment;
  database: string;
}

interface ParseResetArgumentsInput {
  argv: string[];
}

interface ResetArguments {
  mode: ResetMode;
  environment: string;
}

function parseResetArguments({
  argv,
}: ParseResetArgumentsInput): ResetArguments {
  const [mode, flag, environment, ...extra] = argv;
  if (!RESET_MODES.includes(mode as ResetMode)) {
    throw new Error(`Refusing mode "${mode ?? ''}".\n${USAGE}`);
  }
  if (flag !== '--environment' || !environment || extra.length > 0) {
    throw new Error(`Missing or unexpected arguments.\n${USAGE}`);
  }
  return { mode: mode as ResetMode, environment };
}

interface AssertResettableTargetInput {
  requested: string;
  runtimeEnvironment: string;
}

/** Production, local and anything unknown are refused; so is a target that is not the connected one. */
function assertResettableTarget({
  requested,
  runtimeEnvironment,
}: AssertResettableTargetInput): ResettableEnvironment {
  if (!RESETTABLE_ENVIRONMENTS.includes(requested as ResettableEnvironment)) {
    throw new Error(
      `Refusing target "${requested}": only ${RESETTABLE_ENVIRONMENTS.join(' or ')} can be reset.`,
    );
  }
  if (requested !== runtimeEnvironment) {
    throw new Error(
      `Refusing target "${requested}": this process is connected to "${runtimeEnvironment}".`,
    );
  }
  return requested as ResettableEnvironment;
}

interface PoolInput {
  pool: pg.Pool;
}

/** A running server could deliver a claimed email after the reset; it must be stopped first. */
async function assertServerStopped({ pool }: PoolInput): Promise<void> {
  const { rows } = await pool.query<{ connections: number }>(
    `SELECT count(*)::int AS connections FROM pg_stat_activity
     WHERE datname = current_database() AND pid <> pg_backend_pid()
       AND application_name = $1`,
    [SERVER_APPLICATION_NAME],
  );
  const connections = rows[0]?.connections ?? 0;
  if (connections > 0) {
    throw new Error(
      `Refusing reset: the server still has ${connections} connection(s) to this database. Stop the server and web services first.`,
    );
  }
}

async function currentDatabase({ pool }: PoolInput): Promise<string> {
  const { rows } = await pool.query<{ name: string }>(
    'SELECT current_database() AS name',
  );
  return rows[0]?.name as string;
}

interface ResetDatabaseInput {
  pool: pg.Pool;
  mode: ResetMode;
}

/**
 * Empties application data (Churches, users, sessions, pending email) and,
 * in demo mode, loads the development recipe in the same transaction, so a
 * failure leaves the database as it was.
 */
async function resetDatabase({
  pool,
  mode,
}: ResetDatabaseInput): Promise<void> {
  const db = drizzle(pool, { schema });
  const seeded = await db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const tables = rows
      .filter(({ tablename }) => !PRESERVED_TABLES.includes(tablename))
      .map(({ tablename }) => `public."${tablename}"`)
      .join(', ');
    await tx.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY`));
    if (mode === 'clean') return undefined;
    const anchor = today({
      instant: now(),
      timeZone: DEVELOPMENT_CHURCH_TIMEZONE,
    });
    return await runSeedRecipe({
      db: tx,
      recipe: createDevelopmentRecipe({ anchor }),
    });
  });
  if (seeded) await verifyDevelopmentGraph({ db, seeded });
}

/**
 * Resets a development or staging environment to seeded demo data or a clean
 * installation. Every refusal and prerequisite (target, stopped server,
 * reachable Mailpit, successful backup) happens before anything is deleted.
 * Captured messages are deleted last, so mail sent before the reset is gone too.
 */
export async function resetEnvironment({
  pool,
  argv,
  runtimeEnvironment,
  backup,
  capturedMessages,
}: ResetEnvironmentInput): Promise<ResetEnvironmentResult> {
  const { mode, environment: requested } = parseResetArguments({ argv });
  const environment = assertResettableTarget({ requested, runtimeEnvironment });
  await assertServerStopped({ pool });
  await capturedMessages.assertReachable();
  const database = await currentDatabase({ pool });

  await backup({ environment, database });

  await resetDatabase({ pool, mode });
  try {
    await capturedMessages.deleteAll();
  } catch (error) {
    throw new Error(
      `The database was reset, but Mailpit's captured messages were not deleted: ${String(error)}. Delete them in the Mailpit inbox (Delete all) before restarting the server.`,
    );
  }
  return { mode, environment, database };
}

interface MailpitInput {
  url: string;
}

interface MailpitCall {
  path: string;
  method: 'GET' | 'DELETE';
}

function mailpit({ url }: MailpitInput): CapturedMessages {
  const base = url.replace(/\/+$/, '');
  const call = async ({ path, method }: MailpitCall) => {
    const response = await fetch(`${base}${path}`, { method });
    if (!response.ok) {
      throw new Error(`Mailpit ${path} answered HTTP ${response.status}`);
    }
  };
  return {
    assertReachable: () => call({ path: '/api/v1/info', method: 'GET' }),
    deleteAll: () => call({ path: '/api/v1/messages', method: 'DELETE' }),
  };
}

/** Runs the root backup command (#880); only its exit 0 lets the reset continue. */
async function runBackupCommand({
  environment,
  database,
}: BackupTarget): Promise<void> {
  const result = spawnSync(
    'bun',
    [
      'run',
      'backup:create',
      '--',
      `--environment=${environment}`,
      `--database=${database}`,
    ],
    { cwd: resolve(import.meta.dir, '../../../..'), stdio: 'inherit' },
  );
  if (result.status !== 0) {
    throw new Error(
      `Required backup failed (exit ${result.status ?? result.signal}); nothing was reset.`,
    );
  }
}

if (import.meta.main) {
  const { env } = await import('@church/env/server');
  // Overrides the inherited PGAPPNAME, so the reset never counts as the server.
  const connectionString = new URL(env.DATABASE_URL);
  connectionString.searchParams.set('application_name', RESET_APPLICATION_NAME);
  const pool = new pg.Pool({
    connectionString: connectionString.toString(),
    max: 1,
  });
  const mailpitUrl = env.MAILPIT_API_URL;
  resetEnvironment({
    pool,
    argv: process.argv.slice(2),
    runtimeEnvironment: env.CHURCH_ENVIRONMENT,
    backup: runBackupCommand,
    capturedMessages: mailpitUrl
      ? mailpit({ url: mailpitUrl })
      : {
          assertReachable: () =>
            Promise.reject(
              new Error('Missing prerequisite: MAILPIT_API_URL is not set.'),
            ),
          deleteAll: () => Promise.resolve(),
        },
  })
    .then(({ mode, environment, database }) => {
      console.log(`✔ ${environment} (${database}) reset to ${mode}.`);
      process.exitCode = 0;
    })
    .catch((error: unknown) => {
      console.error('✖', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
