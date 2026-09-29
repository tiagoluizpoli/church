import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type DatabasePurpose,
  expectedDatabaseName,
} from '../src/database-target-resolver';
import { getIntegrationDatabaseUrl } from '../src/integration-database-url';
import {
  DatabaseProvisioningError,
  provisionDatabases,
} from '../src/provision-databases';

// Scoped to this worktree so concurrent integration runs in other worktrees
// never create or drop the same scratch databases.
const SCRATCH_WORKTREE = `${process.env.CHURCH_WORKTREE ?? 'unspecified'}_provision_test`;
const PURPOSES: DatabasePurpose[] = ['development', 'integration', 'e2e'];
const SCRATCH_DATABASES = PURPOSES.map((purpose) =>
  expectedDatabaseName({ purpose, worktree: SCRATCH_WORKTREE }),
);
const [DEV_DATABASE = '', INT_DATABASE = '', E2E_DATABASE = ''] =
  SCRATCH_DATABASES;
// The first migration creates this enum; an existing one makes it fail.
const CONFLICTING_TYPE = '"public"."assignment_status"';

interface MigrationJournal {
  entries: unknown[];
}

const journal = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../src/migrations/meta/_journal.json',
    ),
    'utf8',
  ),
) as MigrationJournal;

const integrationDatabaseUrl = getIntegrationDatabaseUrl();

interface DatabaseInput {
  database: string;
}

function databaseUrlFor(input: DatabaseInput): string {
  const url = new URL(integrationDatabaseUrl);
  url.pathname = `/${input.database}`;
  url.search = '';
  return url.toString();
}

const scratchUrls = SCRATCH_DATABASES.map((database) =>
  databaseUrlFor({ database }),
);

const adminPool = new pg.Pool({
  connectionString: databaseUrlFor({ database: 'postgres' }),
  max: 1,
});

interface QueryDatabaseInput extends DatabaseInput {
  sql: string;
}

async function queryDatabase(
  input: QueryDatabaseInput,
): Promise<pg.QueryResult> {
  const pool = new pg.Pool({
    connectionString: databaseUrlFor({ database: input.database }),
    max: 1,
  });
  try {
    return await pool.query(input.sql);
  } finally {
    await pool.end();
  }
}

async function databaseExists(input: DatabaseInput): Promise<boolean> {
  const result = await adminPool.query(
    'select 1 from pg_database where datname = $1',
    [input.database],
  );
  return result.rowCount === 1;
}

async function appliedMigrations(input: DatabaseInput): Promise<number> {
  const result = await queryDatabase({
    database: input.database,
    sql: 'select count(*)::int as count from drizzle.__drizzle_migrations',
  });
  return result.rows[0].count;
}

/** Rows across every application table: bootstrap must not seed data. */
async function applicationRows(input: DatabaseInput): Promise<number> {
  const tables = await queryDatabase({
    database: input.database,
    sql: "select tablename from pg_tables where schemaname = 'public'",
  });
  expect(tables.rowCount).toBeGreaterThan(0);

  const counts = await queryDatabase({
    database: input.database,
    sql: tables.rows
      .map((row) => `select count(*)::int as count from "${row.tablename}"`)
      .join(' union all '),
  });
  return counts.rows.reduce((sum, row) => sum + row.count, 0);
}

async function dropScratchDatabases(): Promise<void> {
  for (const database of SCRATCH_DATABASES) {
    await adminPool.query(`drop database if exists "${database}" with (force)`);
  }
}

describe('provisionDatabases', () => {
  beforeEach(dropScratchDatabases);

  afterAll(async () => {
    await dropScratchDatabases();
    await adminPool.end();
  });

  it('creates and migrates every target without seeding application data', async () => {
    const results = await provisionDatabases({ databaseUrls: scratchUrls });

    expect(results).toEqual(
      SCRATCH_DATABASES.map((database) => ({ database, created: true })),
    );
    for (const database of SCRATCH_DATABASES) {
      expect(await appliedMigrations({ database })).toBe(
        journal.entries.length,
      );
      expect(await applicationRows({ database })).toBe(0);
    }
  });

  it('reuses databases that already exist when rerun', async () => {
    await provisionDatabases({ databaseUrls: scratchUrls });

    const results = await provisionDatabases({ databaseUrls: scratchUrls });

    expect(results.map((result) => result.created)).toEqual([
      false,
      false,
      false,
    ]);
    expect(await appliedMigrations({ database: E2E_DATABASE })).toBe(
      journal.entries.length,
    );
  });

  it('is safe when two bootstraps run concurrently', async () => {
    const [first, second] = await Promise.all([
      provisionDatabases({ databaseUrls: scratchUrls }),
      provisionDatabases({ databaseUrls: scratchUrls }),
    ]);

    const createdBy = SCRATCH_DATABASES.map(
      (_, index) =>
        Number(first[index]?.created) + Number(second[index]?.created),
    );
    expect(createdBy).toEqual([1, 1, 1]);
    for (const database of SCRATCH_DATABASES) {
      expect(await appliedMigrations({ database })).toBe(
        journal.entries.length,
      );
    }
  });

  it('reports the failed step, keeps completed state, and succeeds once rerun', async () => {
    await adminPool.query(`create database "${INT_DATABASE}"`);
    await queryDatabase({
      database: INT_DATABASE,
      sql: `create type ${CONFLICTING_TYPE} as enum ('conflict')`,
    });

    const failure = await provisionDatabases({
      databaseUrls: scratchUrls,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DatabaseProvisioningError);
    expect((failure as DatabaseProvisioningError).step).toBe('migrate');
    expect((failure as DatabaseProvisioningError).database).toBe(INT_DATABASE);
    expect((failure as Error).message).toContain(`migrate ${INT_DATABASE}`);
    const { username, password } = new URL(integrationDatabaseUrl);
    expect((failure as Error).message).not.toContain(
      `${username}:${password}@`,
    );
    expect(await appliedMigrations({ database: DEV_DATABASE })).toBe(
      journal.entries.length,
    );
    expect(await databaseExists({ database: INT_DATABASE })).toBe(true);

    await queryDatabase({
      database: INT_DATABASE,
      sql: `drop type ${CONFLICTING_TYPE}`,
    });
    await provisionDatabases({ databaseUrls: scratchUrls });

    for (const database of SCRATCH_DATABASES) {
      expect(await appliedMigrations({ database })).toBe(
        journal.entries.length,
      );
    }
  });

  it('refuses a database outside the managed namespace before connecting', async () => {
    const failure = await provisionDatabases({
      databaseUrls: [databaseUrlFor({ database: 'postgres' })],
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DatabaseProvisioningError);
    expect((failure as DatabaseProvisioningError).step).toBe('validate');
  });
});
