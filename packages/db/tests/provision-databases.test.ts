import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getIntegrationDatabaseUrl } from '../src/integration-database-url';
import {
  cloneDatabasesFromTemplate,
  DatabaseProvisioningError,
  PROVISIONING_LOCK_KEY,
  provisionDatabases,
} from '../src/provision-databases';
import { scratchDatabaseName } from '../src/scratch-database-name';

const SCRATCH_DATABASES = (['dev', 'int', 'e2e'] as const).map((kind) =>
  scratchDatabaseName({ purpose: 'prov', kind }),
);
const [DEV_DATABASE = '', INT_DATABASE = '', E2E_DATABASE = ''] =
  SCRATCH_DATABASES;
const WORKER_DATABASE = scratchDatabaseName({ purpose: 'w1', kind: 'int' });
const LOCK_WAIT_MS = 300;
const POOL_CLOSE_RACE_DATABASE_COUNT = 10;
const POOL_CLOSE_RACE_ITERATIONS = 10;
const POOL_CLOSE_RACE_DATABASES = Array.from(
  { length: POOL_CLOSE_RACE_DATABASE_COUNT },
  (_, index) =>
    scratchDatabaseName({ purpose: `pool_close_race_${index}`, kind: 'dev' }),
);
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
  max: POOL_CLOSE_RACE_DATABASE_COUNT * 2,
});

interface QueryDatabaseInput extends DatabaseInput {
  sql: string;
  racePoolClose?: () => Promise<void>;
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
    // pool.end() resolves before its client's socket closes, so a later force-drop can still kill that client (57P01).
    pool.on('error', () => {});
    const forceDrop = input.racePoolClose?.();
    const close = pool.end();
    await forceDrop;
    await close;
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
  for (const database of [
    ...SCRATCH_DATABASES,
    WORKER_DATABASE,
    ...POOL_CLOSE_RACE_DATABASES,
  ]) {
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

  it('clones a migrated template for an integration worker without rerunning migrations', async () => {
    await provisionDatabases({
      databaseUrls: [databaseUrlFor({ database: INT_DATABASE })],
    });

    const results = await cloneDatabasesFromTemplate({
      templateUrl: databaseUrlFor({ database: INT_DATABASE }),
      databaseNames: [WORKER_DATABASE],
    });

    expect(results).toEqual([{ database: WORKER_DATABASE, replaced: false }]);
    expect(await appliedMigrations({ database: WORKER_DATABASE })).toBe(
      journal.entries.length,
    );
  });

  it('waits for the provisioning lock before cloning', async () => {
    await provisionDatabases({
      databaseUrls: [databaseUrlFor({ database: INT_DATABASE })],
    });
    const holder = new pg.Client({
      connectionString: databaseUrlFor({ database: 'postgres' }),
    });
    await holder.connect();
    await holder.query('select pg_advisory_lock($1)', [PROVISIONING_LOCK_KEY]);

    try {
      let cloned = false;
      const cloning = cloneDatabasesFromTemplate({
        templateUrl: databaseUrlFor({ database: INT_DATABASE }),
        databaseNames: [WORKER_DATABASE],
      }).then(() => {
        cloned = true;
      });

      await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS));
      expect(cloned).toBe(false);
      expect(await databaseExists({ database: WORKER_DATABASE })).toBe(false);

      await holder.query('select pg_advisory_unlock($1)', [
        PROVISIONING_LOCK_KEY,
      ]);
      await cloning;
      expect(await databaseExists({ database: WORKER_DATABASE })).toBe(true);
    } finally {
      await holder.end();
    }
  });

  it('names the template and what to stop when it is in use', async () => {
    await provisionDatabases({
      databaseUrls: [databaseUrlFor({ database: INT_DATABASE })],
    });
    const occupant = new pg.Client({
      connectionString: databaseUrlFor({ database: INT_DATABASE }),
    });
    await occupant.connect();

    try {
      const failure = await cloneDatabasesFromTemplate({
        templateUrl: databaseUrlFor({ database: INT_DATABASE }),
        databaseNames: [WORKER_DATABASE],
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(DatabaseProvisioningError);
      expect((failure as DatabaseProvisioningError).message).toContain(
        `The template "${INT_DATABASE}" has other connections open`,
      );
      expect((failure as DatabaseProvisioningError).message).toContain(
        'Stop whatever is connected to it',
      );
    } finally {
      await occupant.end();
    }
  });

  it('survives force-drops that race a closing query pool', async () => {
    for (
      let iteration = 0;
      iteration < POOL_CLOSE_RACE_ITERATIONS;
      iteration++
    ) {
      await Promise.all(
        POOL_CLOSE_RACE_DATABASES.map(async (database) => {
          await adminPool.query(
            `drop database if exists "${database}" with (force)`,
          );
          await adminPool.query(`create database "${database}"`);
          await queryDatabase({
            database,
            sql: 'select 1',
            racePoolClose: async () => {
              await adminPool.query(`drop database "${database}" with (force)`);
            },
          });
        }),
      );
    }
  });
});
