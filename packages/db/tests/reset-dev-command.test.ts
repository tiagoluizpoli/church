import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getIntegrationDatabaseUrl } from '../src/integration-database-url';

const RESET_SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'scripts',
  'reset-db.ts',
);
const SCRATCH_WORKTREE = 'reset-dev-command';
const SCRATCH_DATABASE = `church_${SCRATCH_WORKTREE}_dev`;
const SENTINEL_TABLE = 'reset_dev_sentinel';

interface RunResetInput {
  databaseUrl: string;
  worktree: string;
}

interface RunResetResult {
  status: number | null;
  output: string;
}

interface DatabaseUrlForInput {
  database: string;
}

const integrationDatabaseUrl = getIntegrationDatabaseUrl();

function databaseUrlFor(input: DatabaseUrlForInput): string {
  const url = new URL(integrationDatabaseUrl);
  url.pathname = `/${input.database}`;
  url.search = '';
  return url.toString();
}

interface CredentialsOfInput {
  databaseUrl: string;
}

function credentialsOf(input: CredentialsOfInput): string {
  const url = new URL(input.databaseUrl);
  return `${url.username}:${url.password}`;
}

function runReset(input: RunResetInput): RunResetResult {
  const result = spawnSync('bun', [RESET_SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      CHURCH_EXEC_PURPOSE: 'development',
      CHURCH_WORKTREE: input.worktree,
      DATABASE_URL: input.databaseUrl,
    },
  });

  return { status: result.status, output: result.stdout + result.stderr };
}

const adminPool = new pg.Pool({
  connectionString: databaseUrlFor({ database: 'postgres' }),
  max: 1,
});

describe('db:reset:dev command', () => {
  beforeAll(async () => {
    await adminPool.query(`drop database if exists "${SCRATCH_DATABASE}"`);
    await adminPool.query(`create database "${SCRATCH_DATABASE}"`);
  });

  afterAll(async () => {
    await adminPool.query(
      `drop database if exists "${SCRATCH_DATABASE}" with (force)`,
    );
    await adminPool.end();
  });

  it("resets only the current worktree's development database after a redacted preflight", async () => {
    const scratchUrl = databaseUrlFor({ database: SCRATCH_DATABASE });
    const scratchPool = new pg.Pool({ connectionString: scratchUrl, max: 1 });
    await scratchPool.query(`create table ${SENTINEL_TABLE} (id int)`);

    const result = runReset({
      databaseUrl: scratchUrl,
      worktree: SCRATCH_WORKTREE,
    });

    const sentinel = await scratchPool.query(
      'select 1 from pg_tables where tablename = $1',
      [SENTINEL_TABLE],
    );
    await scratchPool.end();

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      `purpose=development worktree=${SCRATCH_WORKTREE}`,
    );
    expect(result.output).toContain(`database=${SCRATCH_DATABASE}`);
    expect(result.output).not.toContain(
      credentialsOf({ databaseUrl: scratchUrl }),
    );
    expect(sentinel.rowCount).toBe(0);
  });

  it("refuses another purpose's database before touching it", () => {
    const result = runReset({
      databaseUrl: integrationDatabaseUrl,
      worktree: SCRATCH_WORKTREE,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('Development database reset failed');
    expect(result.output).not.toContain('purpose=development');
    expect(result.output).not.toContain(
      credentialsOf({ databaseUrl: integrationDatabaseUrl }),
    );
  });
});
