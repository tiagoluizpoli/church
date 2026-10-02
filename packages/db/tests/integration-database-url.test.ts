import { afterEach, describe, expect, it, vi } from 'vitest';
import { getIntegrationDatabaseUrl } from '../src/integration-database-url';

const DATABASE_SERVER = 'postgresql://postgres:postgres@localhost:5444';
const INTEGRATION_URL = `${DATABASE_SERVER}/church_develop_int`;
// CI declares no CHURCH_WORKTREE, so it resolves to the reserved
// "unspecified" worktree (ADR-0005), as the E2E lane does.
const UNSPECIFIED_INTEGRATION_URL = `${DATABASE_SERVER}/church_unspecified_int`;

function resetEnv(): void {
  delete process.env.CHURCH_EXEC_PURPOSE;
  delete process.env.DATABASE_URL;
  delete process.env.CHURCH_WORKTREE;
}

interface IntegrationTargetInput {
  database: string;
  worktree?: string;
}

function useIntegrationTarget(input: IntegrationTargetInput): void {
  process.env.CHURCH_EXEC_PURPOSE = 'integration';
  process.env.DATABASE_URL = `${DATABASE_SERVER}/${input.database}`;
  if (input.worktree) process.env.CHURCH_WORKTREE = input.worktree;
}

describe('getIntegrationDatabaseUrl', () => {
  afterEach(() => {
    resetEnv();
    vi.restoreAllMocks();
  });

  it("returns the current worktree's integration database", () => {
    useIntegrationTarget({
      database: 'church_develop_int',
      worktree: 'develop',
    });

    expect(getIntegrationDatabaseUrl()).toBe(INTEGRATION_URL);
  });

  it('returns the reserved unspecified integration database without CHURCH_WORKTREE', () => {
    useIntegrationTarget({ database: 'church_unspecified_int' });

    expect(getIntegrationDatabaseUrl()).toBe(UNSPECIFIED_INTEGRATION_URL);
  });

  it('reports a redacted preflight identity for the resolved target', () => {
    useIntegrationTarget({
      database: 'church_feature_x_int',
      worktree: 'feature_x',
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    getIntegrationDatabaseUrl();

    expect(logSpy).toHaveBeenCalledWith(
      'purpose=integration worktree=feature_x host=localhost port=5444 database=church_feature_x_int',
    );
    const loggedLine = logSpy.mock.calls[0]?.[0] as string;
    expect(loggedLine).not.toContain('postgres:postgres');
  });

  it('rejects a call made outside the integration purpose', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL = INTEGRATION_URL;

    expect(() => getIntegrationDatabaseUrl()).toThrow(
      /requires CHURCH_EXEC_PURPOSE=integration/,
    );
  });

  it('rejects a missing CHURCH_EXEC_PURPOSE', () => {
    process.env.DATABASE_URL = INTEGRATION_URL;

    expect(() => getIntegrationDatabaseUrl()).toThrow(
      /requires CHURCH_EXEC_PURPOSE=integration/,
    );
  });

  it('rejects a missing DATABASE_URL with no fallback', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'integration';

    expect(() => getIntegrationDatabaseUrl()).toThrow(
      /was not resolved for the integration purpose/,
    );
  });

  it.each([
    ['develop', 'church'],
    ['feature_x', 'church_feature_x_dev'],
  ])('refuses the %s development database %s', (worktree, database) => {
    useIntegrationTarget({ database, worktree });

    expect(() => getIntegrationDatabaseUrl()).toThrow(
      /may not target the development database/,
    );
  });

  it.each([
    ['an E2E database', 'church_feature_x_e2e'],
    ["another worktree's integration database", 'church_feature_y_int'],
    ['an unscoped test database', 'church_test'],
  ])('refuses %s', (_label, database) => {
    useIntegrationTarget({ database, worktree: 'feature_x' });

    expect(() => getIntegrationDatabaseUrl()).toThrow(
      /does not match the expected "church_feature_x_int"/,
    );
  });

  it('refuses a database outside the managed "church" namespace', () => {
    useIntegrationTarget({ database: 'postgres', worktree: 'feature_x' });

    expect(() => getIntegrationDatabaseUrl()).toThrow(
      /is outside the managed "church" namespace/,
    );
  });
});
