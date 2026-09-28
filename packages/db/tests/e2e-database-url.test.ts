import { afterEach, describe, expect, it, vi } from 'vitest';
import { getE2eDatabaseUrl } from '../src/e2e-database-url';

const DEVELOPMENT_URL = 'postgresql://postgres:postgres@localhost:5444/church';
const E2E_URL =
  'postgresql://postgres:postgres@localhost:5444/church_develop_e2e';
const INTEGRATION_URL =
  'postgresql://postgres:postgres@localhost:5444/church_develop_int';
const UNMANAGED_URL = 'postgresql://postgres:postgres@localhost:5444/postgres';

function resetEnv(): void {
  delete process.env.CHURCH_EXEC_PURPOSE;
  delete process.env.DATABASE_URL;
  delete process.env.DEVELOPMENT_DATABASE_URL;
  delete process.env.CHURCH_WORKTREE;
}

describe('getE2eDatabaseUrl', () => {
  afterEach(() => {
    resetEnv();
    vi.restoreAllMocks();
  });

  it('returns DATABASE_URL when running under the e2e purpose', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL = E2E_URL;
    process.env.DEVELOPMENT_DATABASE_URL = DEVELOPMENT_URL;
    process.env.CHURCH_WORKTREE = 'develop';

    expect(getE2eDatabaseUrl()).toBe(E2E_URL);
  });

  it('reports a redacted preflight identity for the resolved target', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL = E2E_URL;
    process.env.DEVELOPMENT_DATABASE_URL = DEVELOPMENT_URL;
    process.env.CHURCH_WORKTREE = 'develop';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    getE2eDatabaseUrl();

    expect(logSpy).toHaveBeenCalledWith(
      'purpose=e2e worktree=develop host=localhost port=5444 database=church_develop_e2e',
    );
    const loggedLine = logSpy.mock.calls[0]?.[0] as string;
    expect(loggedLine).not.toContain('postgres:postgres');
  });

  it('labels the preflight identity with CHURCH_WORKTREE when set', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5444/church_feature-x_e2e';
    process.env.DEVELOPMENT_DATABASE_URL = DEVELOPMENT_URL;
    process.env.CHURCH_WORKTREE = 'feature-x';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    getE2eDatabaseUrl();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('worktree=feature-x'),
    );
  });

  it('rejects a call made outside the e2e purpose', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL = E2E_URL;
    process.env.DEVELOPMENT_DATABASE_URL = DEVELOPMENT_URL;

    expect(() => getE2eDatabaseUrl()).toThrow(
      /requires CHURCH_EXEC_PURPOSE=e2e/,
    );
  });

  it('rejects a missing CHURCH_EXEC_PURPOSE', () => {
    process.env.DATABASE_URL = E2E_URL;
    process.env.DEVELOPMENT_DATABASE_URL = DEVELOPMENT_URL;

    expect(() => getE2eDatabaseUrl()).toThrow(
      /requires CHURCH_EXEC_PURPOSE=e2e/,
    );
  });

  it('rejects a missing DATABASE_URL with no fallback', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DEVELOPMENT_DATABASE_URL = DEVELOPMENT_URL;

    expect(() => getE2eDatabaseUrl()).toThrow(
      /was not resolved for the e2e purpose/,
    );
  });

  it('rejects a missing DEVELOPMENT_DATABASE_URL', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL = E2E_URL;

    expect(() => getE2eDatabaseUrl()).toThrow(
      /DEVELOPMENT_DATABASE_URL was not resolved/,
    );
  });

  it('refuses the development database', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL = DEVELOPMENT_URL;
    process.env.DEVELOPMENT_DATABASE_URL = DEVELOPMENT_URL;
    process.env.CHURCH_WORKTREE = 'develop';

    expect(() => getE2eDatabaseUrl()).toThrow(
      /may not target the development database/,
    );
  });

  it('refuses an integration database', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL = INTEGRATION_URL;
    process.env.DEVELOPMENT_DATABASE_URL = DEVELOPMENT_URL;
    process.env.CHURCH_WORKTREE = 'develop';

    expect(() => getE2eDatabaseUrl()).toThrow(
      /does not match the expected "church_develop_e2e"/,
    );
  });

  it('refuses a database outside the managed "church" namespace', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL = UNMANAGED_URL;
    process.env.DEVELOPMENT_DATABASE_URL = DEVELOPMENT_URL;
    process.env.CHURCH_WORKTREE = 'develop';

    expect(() => getE2eDatabaseUrl()).toThrow(
      /is outside the managed "church" namespace/,
    );
  });
});
