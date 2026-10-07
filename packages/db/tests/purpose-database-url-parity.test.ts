import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DATABASE_PURPOSES,
  type DatabasePurpose,
} from '../src/database-target-resolver';
import { getDevelopmentDatabaseUrl } from '../src/development-database-url';
import { getE2eDatabaseUrl } from '../src/e2e-database-url';
import { getIntegrationDatabaseUrl } from '../src/integration-database-url';

/**
 * One target matrix for every purpose getter (ADR-0005): each accepts
 * exactly its own worktree's purpose database and refuses the rest. The
 * getters drifted once (integration skipped `resolveDatabaseTarget` until
 * #354); a getter that stops resolving, or a purpose with no getter here,
 * fails this test.
 */

const WORKTREE = 'feature-x';

const GETTERS: Record<DatabasePurpose, () => string> = {
  development: getDevelopmentDatabaseUrl,
  integration: getIntegrationDatabaseUrl,
  e2e: getE2eDatabaseUrl,
};

const OWN_DATABASE: Record<DatabasePurpose, string> = {
  development: 'church_feature-x_dev',
  integration: 'church_feature-x_int',
  e2e: 'church_feature-x_e2e',
};

const OTHER_WORKTREE_DATABASE: Record<DatabasePurpose, string> = {
  development: 'church_other-x_dev',
  integration: 'church_other-x_int',
  e2e: 'church_other-x_e2e',
};

const TARGET_DATABASES = [
  ...Object.values(OWN_DATABASE),
  ...Object.values(OTHER_WORKTREE_DATABASE),
  'church',
  'church_test',
  'postgres',
];

const ENV_KEYS = [
  'CHURCH_EXEC_PURPOSE',
  'CHURCH_WORKTREE',
  'DATABASE_URL',
  'NODE_ENV',
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

type SavedEnv = Partial<Record<EnvKey, string>>;

interface AcceptedDatabasesInput {
  purpose: DatabasePurpose;
}

function acceptedDatabases({ purpose }: AcceptedDatabasesInput): string[] {
  process.env.CHURCH_EXEC_PURPOSE = purpose;
  process.env.CHURCH_WORKTREE = WORKTREE;

  return TARGET_DATABASES.filter((database) => {
    process.env.DATABASE_URL = `postgresql://postgres:postgres@localhost:5444/${database}`;
    try {
      GETTERS[purpose]();
      return true;
    } catch {
      return false;
    }
  });
}

describe('purpose database URL getters', () => {
  let savedEnv: SavedEnv;

  beforeEach(() => {
    savedEnv = Object.fromEntries(
      ENV_KEYS.map((key) => [key, process.env[key]]),
    );
    process.env.NODE_ENV = 'test';
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it('has a getter for every database purpose', () => {
    expect(Object.keys(GETTERS).sort()).toEqual([...DATABASE_PURPOSES].sort());
  });

  it.each([
    ...DATABASE_PURPOSES,
  ])('the %s getter accepts only its own worktree purpose database', (purpose) => {
    expect(acceptedDatabases({ purpose })).toEqual([OWN_DATABASE[purpose]]);
  });
});
