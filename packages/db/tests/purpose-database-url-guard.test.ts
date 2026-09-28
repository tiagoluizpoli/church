import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  reportDatabaseTarget,
  requireDatabaseUrl,
  requireExecPurpose,
} from '../src/purpose-database-url-guard';

function resetEnv(): void {
  delete process.env.CHURCH_EXEC_PURPOSE;
  delete process.env.DATABASE_URL;
}

describe('requireExecPurpose', () => {
  afterEach(resetEnv);

  it('passes when CHURCH_EXEC_PURPOSE matches', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';

    expect(() =>
      requireExecPurpose({ purpose: 'e2e', functionName: 'getE2eDatabaseUrl' }),
    ).not.toThrow();
  });

  it('rejects a mismatched or missing purpose, naming the calling function', () => {
    expect(() =>
      requireExecPurpose({
        purpose: 'integration',
        functionName: 'getIntegrationDatabaseUrl',
      }),
    ).toThrow(
      /getIntegrationDatabaseUrl\(\) requires CHURCH_EXEC_PURPOSE=integration/,
    );
  });
});

describe('requireDatabaseUrl', () => {
  afterEach(resetEnv);

  it('returns DATABASE_URL when present', () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5444/church_test';

    expect(requireDatabaseUrl({ purpose: 'integration' })).toBe(
      'postgresql://postgres:postgres@localhost:5444/church_test',
    );
  });

  it('rejects a missing DATABASE_URL, labeling the purpose', () => {
    expect(() => requireDatabaseUrl({ purpose: 'e2e' })).toThrow(
      /DATABASE_URL was not resolved for the e2e purpose\. E2E has no fallback/,
    );
  });
});

describe('reportDatabaseTarget', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs the redacted preflight line for the given identity', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    reportDatabaseTarget({
      identity: {
        purpose: 'e2e',
        worktree: 'develop',
        host: 'localhost',
        port: 5444,
        database: 'church_develop_e2e',
      },
    });

    expect(logSpy).toHaveBeenCalledWith(
      'purpose=e2e worktree=develop host=localhost port=5444 database=church_develop_e2e',
    );
  });
});
