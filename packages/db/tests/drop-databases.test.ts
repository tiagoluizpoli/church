import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type DatabasePurpose,
  expectedDatabaseName,
} from '../src/database-target-resolver';
import {
  DatabaseDropError,
  dropDatabases,
  isWorktreeDatabaseName,
  listWorktreeDatabases,
} from '../src/drop-databases';
import { getIntegrationDatabaseUrl } from '../src/integration-database-url';

// Scoped to this worktree so concurrent integration runs in other worktrees
// never create or drop the same scratch databases.
const SCRATCH_WORKTREE = `${process.env.CHURCH_WORKTREE ?? 'unspecified'}_drop_test`;
const KEPT_WORKTREE = `${SCRATCH_WORKTREE}_kept`;
const PURPOSES: DatabasePurpose[] = ['development', 'integration', 'e2e'];
const SCRATCH_DATABASES = PURPOSES.map((purpose) =>
  expectedDatabaseName({ purpose, worktree: SCRATCH_WORKTREE }),
);
const KEPT_DATABASE = expectedDatabaseName({
  purpose: 'integration',
  worktree: KEPT_WORKTREE,
});
const UNREACHABLE_SERVER_URL = 'postgresql://postgres:postgres@127.0.0.1:1';

const serverUrl = (() => {
  const url = new URL(getIntegrationDatabaseUrl());
  url.pathname = '/postgres';
  url.search = '';
  return url.toString();
})();

const adminPool = new pg.Pool({ connectionString: serverUrl, max: 1 });

interface DatabaseInput {
  database: string;
}

function databaseUrlFor(input: DatabaseInput): string {
  const url = new URL(serverUrl);
  url.pathname = `/${input.database}`;
  return url.toString();
}

async function databaseExists(input: DatabaseInput): Promise<boolean> {
  const result = await adminPool.query(
    'select 1 from pg_database where datname = $1',
    [input.database],
  );
  return result.rowCount === 1;
}

async function dropScratchDatabases(): Promise<void> {
  for (const database of [...SCRATCH_DATABASES, KEPT_DATABASE]) {
    await adminPool.query(`drop database if exists "${database}" with (force)`);
  }
}

async function createScratchDatabases(): Promise<void> {
  for (const database of [...SCRATCH_DATABASES, KEPT_DATABASE]) {
    await adminPool.query(`create database "${database}"`);
  }
}

afterAll(async () => {
  await dropScratchDatabases();
  await adminPool.end();
});

describe('isWorktreeDatabaseName', () => {
  it.each([
    'church_feature_a_dev',
    'church_feature_a_int',
    'church_develop_e2e',
    'church_x__1a2b3c4d_int',
  ])('accepts the worktree database %s', (database) => {
    expect(isWorktreeDatabaseName({ database })).toBe(true);
  });

  it.each([
    'church',
    'church_test',
    'church_dev',
    'church_feature_a_prod',
    'postgres',
    'other_feature_a_dev',
    'church_Feature_dev',
    'church_feature-a_dev',
  ])('rejects %s', (database) => {
    expect(isWorktreeDatabaseName({ database })).toBe(false);
  });
});

describe('dropDatabases', () => {
  beforeEach(async () => {
    await dropScratchDatabases();
    await createScratchDatabases();
  });

  it('drops exactly the named databases and leaves every other one', async () => {
    const results = await dropDatabases({
      serverUrl,
      databases: SCRATCH_DATABASES,
    });

    expect(results).toEqual(
      SCRATCH_DATABASES.map((database) => ({ database, existed: true })),
    );
    for (const database of SCRATCH_DATABASES) {
      expect(await databaseExists({ database })).toBe(false);
    }
    expect(await databaseExists({ database: KEPT_DATABASE })).toBe(true);
    expect(await databaseExists({ database: 'church' })).toBe(true);
  });

  it('terminates active connections to a target before dropping it', async () => {
    const [target = ''] = SCRATCH_DATABASES;
    const session = new pg.Client({
      connectionString: databaseUrlFor({ database: target }),
    });
    session.on('error', () => {});
    await session.connect();

    try {
      await dropDatabases({ serverUrl, databases: [target] });

      expect(await databaseExists({ database: target })).toBe(false);
      await expect(session.query('select 1')).rejects.toThrow();
    } finally {
      await session.end().catch(() => {});
    }
  });

  it('reports a database that is already gone without failing', async () => {
    const [target = ''] = SCRATCH_DATABASES;
    await dropDatabases({ serverUrl, databases: [target] });

    const results = await dropDatabases({ serverUrl, databases: [target] });

    expect(results).toEqual([{ database: target, existed: false }]);
  });

  it.each([
    'church',
    'church_test',
    'postgres',
  ])('refuses %s before connecting', async (database) => {
    const failure = await dropDatabases({
      serverUrl: UNREACHABLE_SERVER_URL,
      databases: [...SCRATCH_DATABASES, database],
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DatabaseDropError);
    expect((failure as DatabaseDropError).step).toBe('validate');
    expect((failure as DatabaseDropError).database).toBe(database);
    for (const scratch of SCRATCH_DATABASES) {
      expect(await databaseExists({ database: scratch })).toBe(true);
    }
  });

  it('reports an unreachable server as a connect failure', async () => {
    const failure = await dropDatabases({
      serverUrl: UNREACHABLE_SERVER_URL,
      databases: SCRATCH_DATABASES,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DatabaseDropError);
    expect((failure as DatabaseDropError).step).toBe('connect');
    expect((failure as Error).message).not.toContain('postgres:postgres@');
  });
});

describe('listWorktreeDatabases', () => {
  beforeEach(async () => {
    await dropScratchDatabases();
    await createScratchDatabases();
  });

  it('lists the worktree databases and nothing outside that namespace', async () => {
    const databases = await listWorktreeDatabases({ serverUrl });

    expect(databases).toEqual(
      expect.arrayContaining([...SCRATCH_DATABASES, KEPT_DATABASE]),
    );
    expect(databases).not.toContain('church');
    expect(databases).not.toContain('postgres');
    expect(
      databases.every((database) => isWorktreeDatabaseName({ database })),
    ).toBe(true);
  });

  it('reports an unreachable server as a connect failure', async () => {
    const failure = await listWorktreeDatabases({
      serverUrl: UNREACHABLE_SERVER_URL,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DatabaseDropError);
    expect((failure as DatabaseDropError).step).toBe('connect');
  });
});
