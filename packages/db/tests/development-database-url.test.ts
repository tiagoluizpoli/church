import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevelopmentDatabaseUrl } from '../src/development-database-url';

const PRIMARY_URL = 'postgresql://postgres:postgres@localhost:5444/church';
const FEATURE_URL =
  'postgresql://postgres:postgres@localhost:5444/church_feature-x_dev';

const primaryCheckout = { isPrimaryWorktree: () => true };
const linkedCheckout = { isPrimaryWorktree: () => false };

function resetEnv(): void {
  delete process.env.CHURCH_EXEC_PURPOSE;
  delete process.env.DATABASE_URL;
  delete process.env.CHURCH_WORKTREE;
}

describe('getDevelopmentDatabaseUrl', () => {
  // Varlock injects the worktree's own CHURCH_WORKTREE from `.env.local`.
  beforeEach(resetEnv);

  afterEach(() => {
    resetEnv();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('resolves the primary worktree to the church database', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL = PRIMARY_URL;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(getDevelopmentDatabaseUrl(primaryCheckout)).toBe(PRIMARY_URL);
    expect(logSpy).toHaveBeenCalledWith(
      'purpose=development worktree=develop host=localhost port=5444 database=church',
    );
    const loggedLine = logSpy.mock.calls[0]?.[0] as string;
    expect(loggedLine).not.toContain('postgres:postgres');
  });

  it('resolves a declared feature worktree to its own development database', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL = FEATURE_URL;
    process.env.CHURCH_WORKTREE = 'feature-x';
    vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(getDevelopmentDatabaseUrl(linkedCheckout)).toBe(FEATURE_URL);
  });

  it("refuses a feature worktree pointed at the primary worktree's database", () => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL = PRIMARY_URL;
    process.env.CHURCH_WORKTREE = 'feature-x';

    expect(() => getDevelopmentDatabaseUrl(linkedCheckout)).toThrow(
      /does not match the expected "church_feature-x_dev"/,
    );
  });

  it('refuses a linked worktree with no declared identity', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL = PRIMARY_URL;

    expect(() => getDevelopmentDatabaseUrl(linkedCheckout)).toThrow(
      /CHURCH_WORKTREE is not set and this checkout is a linked worktree/,
    );
  });

  it.each([
    ['integration', 'church_develop_int'],
    ['e2e', 'church_develop_e2e'],
    ['another worktree', 'church_other_dev'],
    ['unmanaged', 'postgres'],
  ])('refuses the %s database', (_label, database) => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL = `postgresql://postgres:postgres@localhost:5444/${database}`;

    expect(() => getDevelopmentDatabaseUrl(primaryCheckout)).toThrow();
  });

  it.each([
    ['a remote host', 'db.example.com'],
    ['a private-network host', '10.0.0.12'],
  ])('refuses a production-like target on %s before reporting it', (_label, host) => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL = `postgresql://postgres:postgres@${host}:5432/church`;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(() => getDevelopmentDatabaseUrl(primaryCheckout)).toThrow(
      /production-like/,
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it.each([
    'localhost',
    '127.0.0.1',
    '[::1]',
  ])('accepts the loopback host %s', (host) => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL = `postgresql://postgres:postgres@${host}:5444/church`;
    vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(getDevelopmentDatabaseUrl(primaryCheckout)).toBe(
      process.env.DATABASE_URL,
    );
  });

  it('refuses a production runtime even for its own development database', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL = PRIMARY_URL;
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => getDevelopmentDatabaseUrl(primaryCheckout)).toThrow(
      /production-like/,
    );
  });

  it('rejects a call made outside the development purpose', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'integration';
    process.env.DATABASE_URL = PRIMARY_URL;

    expect(() => getDevelopmentDatabaseUrl(primaryCheckout)).toThrow(
      /requires CHURCH_EXEC_PURPOSE=development/,
    );
  });

  it('rejects a missing DATABASE_URL', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';

    expect(() => getDevelopmentDatabaseUrl(primaryCheckout)).toThrow(
      /DATABASE_URL was not resolved for the development purpose/,
    );
  });
});
