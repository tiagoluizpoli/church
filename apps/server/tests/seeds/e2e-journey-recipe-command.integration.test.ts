import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateDevelopmentSchema } from '@church/db/development-database-reset';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { fromDate, today } from '@church/time';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SEED_PERSONA_PASSWORD } from '../../seeds/blueprints/credentials';
import {
  E2E_JOURNEY_RECIPE_NAMES,
  E2E_JOURNEY_TIMEZONE,
} from '../../seeds/e2e/journey-keys';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOAD_COMMAND = join(
  SERVER_ROOT,
  'seeds',
  'e2e',
  'load-journey-recipe.ts',
);
const RECIPE = E2E_JOURNEY_RECIPE_NAMES.volunteerAssignments;
/** Fixed scratch names collide across worktrees sharing one Postgres, so
 * every one carries this worktree's name. */
const SCRATCH_WORKTREE = `${process.env.CHURCH_WORKTREE ?? 'unspecified'}_e2e_recipe_cmd`;
const SCRATCH_DEV_DATABASE = `church_${SCRATCH_WORKTREE}_dev`;
const SCRATCH_E2E_DATABASE = `church_${SCRATCH_WORKTREE}_e2e`;
const SCRATCH_INTEGRATION_DATABASE = `church_${SCRATCH_WORKTREE}_int`;
const OTHER_WORKTREE_E2E_DATABASE = `church_${SCRATCH_WORKTREE}_other_e2e`;
const UNMANAGED_DATABASE = 'postgres';
const PREFLIGHT_LINE = 'purpose=e2e worktree=';

const integrationDatabaseUrl = getIntegrationDatabaseUrl();
const credentials = (() => {
  const url = new URL(integrationDatabaseUrl);
  return `${url.username}:${url.password}`;
})();

interface DatabaseInput {
  database: string;
}

function databaseUrlFor({ database }: DatabaseInput): string {
  const url = new URL(integrationDatabaseUrl);
  url.pathname = `/${database}`;
  url.search = '';
  return url.toString();
}

interface RunLoaderInput {
  databaseUrl: string;
  purpose?: string;
  args?: string[];
}

interface RunLoaderResult {
  status: number | null;
  stdout: string;
  output: string;
}

function runLoader({
  databaseUrl,
  purpose = 'e2e',
  args = [RECIPE, '--key=cmd-test'],
}: RunLoaderInput): RunLoaderResult {
  const result = spawnSync(
    'bun',
    ['--no-env-file', 'run', LOAD_COMMAND, ...args],
    {
      cwd: SERVER_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        CHURCH_EXEC_PURPOSE: purpose,
        CHURCH_WORKTREE: SCRATCH_WORKTREE,
        DATABASE_URL: databaseUrl,
      },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    output: result.stdout + result.stderr,
  };
}

const adminPool = new pg.Pool({
  connectionString: databaseUrlFor({ database: 'postgres' }),
  max: 1,
});

async function recreateDatabase({ database }: DatabaseInput): Promise<void> {
  await adminPool.query(`drop database if exists "${database}" with (force)`);
  await adminPool.query(`create database "${database}"`);
}

interface WithDatabaseInput<T> extends DatabaseInput {
  use: (pool: pg.Pool) => Promise<T>;
}

async function withDatabase<T>({
  database,
  use,
}: WithDatabaseInput<T>): Promise<T> {
  const pool = new pg.Pool({
    connectionString: databaseUrlFor({ database }),
    max: 1,
  });
  try {
    return await use(pool);
  } finally {
    await pool.end();
  }
}

interface RowCountRow {
  value: string;
}

interface TableInput extends DatabaseInput {
  table: string;
}

async function hasTable({ database, table }: TableInput): Promise<boolean> {
  return await withDatabase({
    database,
    use: async (pool) => {
      const result = await pool.query(
        'select 1 from pg_tables where schemaname = $1 and tablename = $2',
        ['public', table],
      );
      return result.rowCount === 1;
    },
  });
}

async function countRows({ database, table }: TableInput): Promise<number> {
  return await withDatabase({
    database,
    use: async (pool) => {
      const result = await pool.query<RowCountRow>(
        `select count(*)::text as value from "${table}"`,
      );
      return Number(result.rows[0]?.value ?? 0);
    },
  });
}

/** The tables a wrongly connected loader would write to first. */
const WATCHED_TABLES = ['organization', 'user'];

async function watchedCounts({ database }: DatabaseInput): Promise<number[]> {
  return await Promise.all(
    WATCHED_TABLES.map((table) => countRows({ database, table })),
  );
}

const journeyOutputSchema = z.object({
  anchor: z.string(),
  church: z.object({ id: z.string(), slug: z.string() }),
  volunteer: z.object({
    userId: z.string(),
    email: z.string(),
    password: z.string(),
  }),
  assignment: z.object({ id: z.string() }),
});

interface ParseJourneyInput {
  stdout: string;
}

function parseJourney({ stdout }: ParseJourneyInput) {
  return journeyOutputSchema.parse(JSON.parse(lastLine({ stdout })));
}

interface LastLineInput {
  stdout: string;
}

function lastLine({ stdout }: LastLineInput): string {
  return stdout.trimEnd().split('\n').at(-1) ?? '';
}

describe('E2E journey recipe loader command', () => {
  const scratchDatabases = [
    SCRATCH_DEV_DATABASE,
    SCRATCH_E2E_DATABASE,
    SCRATCH_INTEGRATION_DATABASE,
    OTHER_WORKTREE_E2E_DATABASE,
  ];

  beforeAll(async () => {
    for (const database of scratchDatabases) {
      await recreateDatabase({ database });
      // Migrated, so a loader that wrongly connected could really write.
      await withDatabase({
        database,
        use: (pool) => migrateDevelopmentSchema({ pool }),
      });
    }
  });

  afterAll(async () => {
    for (const database of scratchDatabases) {
      await adminPool.query(
        `drop database if exists "${database}" with (force)`,
      );
    }
    await adminPool.end();
  });

  it.each([
    {
      label: 'the development purpose',
      purpose: 'development',
      database: SCRATCH_DEV_DATABASE,
      reason: 'requires CHURCH_EXEC_PURPOSE=e2e',
    },
    {
      label: "this worktree's development database under the e2e purpose",
      purpose: 'e2e',
      database: SCRATCH_DEV_DATABASE,
      reason: 'may not target the development database',
    },
    {
      label: "another worktree's E2E database",
      purpose: 'e2e',
      database: OTHER_WORKTREE_E2E_DATABASE,
      reason: `does not match the expected "${SCRATCH_E2E_DATABASE}"`,
    },
    {
      label: 'an integration database',
      purpose: 'e2e',
      database: SCRATCH_INTEGRATION_DATABASE,
      reason: `does not match the expected "${SCRATCH_E2E_DATABASE}"`,
    },
  ])('refuses $label before any mutation and exits non-zero', async ({
    purpose,
    database,
    reason,
  }) => {
    const before = await watchedCounts({ database });

    const result = runLoader({
      databaseUrl: databaseUrlFor({ database }),
      purpose,
    });

    expect(result.status).not.toBe(0);
    expect(result.output).toContain(reason);
    expect(result.output).not.toContain(PREFLIGHT_LINE);
    expect(result.output).not.toContain(credentials);
    expect(result.stdout).not.toMatch(/^\{/m);
    expect(await watchedCounts({ database })).toEqual(before);
  });

  it('refuses an unmanaged database before any mutation and exits non-zero', async () => {
    const result = runLoader({
      databaseUrl: databaseUrlFor({ database: UNMANAGED_DATABASE }),
    });

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('outside the managed "church" namespace');
    expect(result.output).not.toContain(PREFLIGHT_LINE);
    expect(result.output).not.toContain(credentials);
    expect(result.stdout).not.toMatch(/^\{/m);
    expect(
      await hasTable({ database: UNMANAGED_DATABASE, table: 'organization' }),
    ).toBe(false);
  });

  it('refuses an unknown recipe or a missing key before resolving the target', () => {
    const unknown = runLoader({
      databaseUrl: databaseUrlFor({ database: SCRATCH_E2E_DATABASE }),
      args: ['no-such-recipe', '--key=k'],
    });
    const keyless = runLoader({
      databaseUrl: databaseUrlFor({ database: SCRATCH_E2E_DATABASE }),
      args: [RECIPE],
    });

    expect(unknown.status).not.toBe(0);
    expect(unknown.output).toContain('Unknown recipe');
    expect(keyless.status).not.toBe(0);
    expect(keyless.output).toContain('Usage:');
    expect(unknown.output + keyless.output).not.toContain(PREFLIGHT_LINE);
  });

  it('loads the journey into the E2E database, printing the preflight line then the result as the last line, and returns the same ids on a second run', async () => {
    const databaseUrl = databaseUrlFor({ database: SCRATCH_E2E_DATABASE });
    const before = today({
      instant: fromDate({ date: new Date() }),
      timeZone: E2E_JOURNEY_TIMEZONE,
    });

    const first = runLoader({ databaseUrl });
    expect(first.status, first.output).toBe(0);
    const second = runLoader({ databaseUrl });
    expect(second.status, second.output).toBe(0);

    expect(first.output).toContain(`${PREFLIGHT_LINE}${SCRATCH_WORKTREE}`);
    expect(first.output).toContain(`database=${SCRATCH_E2E_DATABASE}`);
    expect(first.output).not.toContain(credentials);
    expect(first.output.indexOf(PREFLIGHT_LINE)).toBeLessThan(
      first.output.indexOf('{"anchor"'),
    );

    const firstJourney = parseJourney({ stdout: first.stdout });
    const secondJourney = parseJourney({ stdout: second.stdout });
    expect(firstJourney.volunteer.password).toBe(SEED_PERSONA_PASSWORD);
    expect(firstJourney.church.slug).toMatch(/^e2e-[0-9a-f]{12}$/);
    expect(firstJourney.anchor >= before).toBe(true);
    expect(secondJourney.assignment.id).toEqual(firstJourney.assignment.id);
    expect(secondJourney.volunteer.userId).toEqual(
      firstJourney.volunteer.userId,
    );
    expect(secondJourney.church).toEqual(firstJourney.church);

    expect(
      await countRows({
        database: SCRATCH_E2E_DATABASE,
        table: 'organization',
      }),
    ).toBe(1);
  });
});
