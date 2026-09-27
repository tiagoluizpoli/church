import { describe, expect, it } from 'vitest';
import {
  DatabaseTargetError,
  formatDatabaseTargetPreflight,
  resolveDatabaseTarget,
} from '../src/database-target-resolver';

interface ExpectRejectionReasonInput {
  action: () => unknown;
  reason: DatabaseTargetError['reason'];
}

function expectRejectionReason(input: ExpectRejectionReasonInput): void {
  try {
    input.action();
  } catch (error) {
    expect(error).toBeInstanceOf(DatabaseTargetError);
    expect((error as DatabaseTargetError).reason).toBe(input.reason);
    return;
  }

  throw new Error(
    'expected the action to throw a DatabaseTargetError, but it did not throw',
  );
}

const PRIMARY_DEVELOPMENT_URL =
  'postgresql://postgres:postgres@localhost:5444/church';
const PRIMARY_INTEGRATION_URL =
  'postgresql://postgres:postgres@localhost:5444/church_develop_int';
const PRIMARY_E2E_URL =
  'postgresql://postgres:postgres@localhost:5444/church_develop_e2e';

const FEATURE_DEVELOPMENT_URL =
  'postgresql://postgres:postgres@localhost:5444/church_246-resolver_dev';
const FEATURE_INTEGRATION_URL =
  'postgresql://postgres:postgres@localhost:5444/church_246-resolver_int';
const FEATURE_E2E_URL =
  'postgresql://postgres:postgres@localhost:5444/church_246-resolver_e2e';

describe('resolveDatabaseTarget', () => {
  describe('the primary worktree', () => {
    it('resolves the development purpose to the literal "church" database', () => {
      const identity = resolveDatabaseTarget({
        purpose: 'development',
        worktree: 'develop',
        candidates: { development: PRIMARY_DEVELOPMENT_URL },
      });

      expect(identity).toEqual({
        purpose: 'development',
        worktree: 'develop',
        host: 'localhost',
        port: 5444,
        database: 'church',
      });
    });

    it('resolves the integration purpose to its dedicated database', () => {
      const identity = resolveDatabaseTarget({
        purpose: 'integration',
        worktree: 'develop',
        candidates: {
          development: PRIMARY_DEVELOPMENT_URL,
          integration: PRIMARY_INTEGRATION_URL,
        },
      });

      expect(identity.database).toBe('church_develop_int');
    });

    it('resolves the e2e purpose to its dedicated database', () => {
      const identity = resolveDatabaseTarget({
        purpose: 'e2e',
        worktree: 'develop',
        candidates: {
          development: PRIMARY_DEVELOPMENT_URL,
          e2e: PRIMARY_E2E_URL,
        },
      });

      expect(identity.database).toBe('church_develop_e2e');
    });
  });

  describe('a feature worktree', () => {
    it('resolves the development purpose to its worktree-scoped database', () => {
      const identity = resolveDatabaseTarget({
        purpose: 'development',
        worktree: '246-resolver',
        candidates: { development: FEATURE_DEVELOPMENT_URL },
      });

      expect(identity.database).toBe('church_246-resolver_dev');
    });

    it('resolves the integration purpose to its worktree-scoped database', () => {
      const identity = resolveDatabaseTarget({
        purpose: 'integration',
        worktree: '246-resolver',
        candidates: {
          development: FEATURE_DEVELOPMENT_URL,
          integration: FEATURE_INTEGRATION_URL,
        },
      });

      expect(identity.database).toBe('church_246-resolver_int');
    });

    it('resolves the e2e purpose to its worktree-scoped database', () => {
      const identity = resolveDatabaseTarget({
        purpose: 'e2e',
        worktree: '246-resolver',
        candidates: {
          development: FEATURE_DEVELOPMENT_URL,
          e2e: FEATURE_E2E_URL,
        },
      });

      expect(identity.database).toBe('church_246-resolver_e2e');
    });
  });

  describe('missing targets', () => {
    it('rejects an integration purpose with no configured integration target', () => {
      expectRejectionReason({
        action: () =>
          resolveDatabaseTarget({
            purpose: 'integration',
            worktree: 'develop',
            candidates: { development: PRIMARY_DEVELOPMENT_URL },
          }),
        reason: 'missing-target',
      });
    });

    it('rejects an e2e purpose with no configured e2e target', () => {
      expectRejectionReason({
        action: () =>
          resolveDatabaseTarget({
            purpose: 'e2e',
            worktree: 'develop',
            candidates: { development: PRIMARY_DEVELOPMENT_URL },
          }),
        reason: 'missing-target',
      });
    });

    it('never falls back to the development target for integration', () => {
      expectRejectionReason({
        action: () =>
          resolveDatabaseTarget({
            purpose: 'integration',
            worktree: 'develop',
            candidates: {
              development: PRIMARY_DEVELOPMENT_URL,
              integration: '',
            },
          }),
        reason: 'missing-target',
      });
    });
  });

  describe('invalid urls', () => {
    it('rejects a target that is not a valid URL', () => {
      expectRejectionReason({
        action: () =>
          resolveDatabaseTarget({
            purpose: 'development',
            worktree: 'develop',
            candidates: { development: 'not-a-url' },
          }),
        reason: 'invalid-url',
      });
    });
  });

  describe('unmanaged targets', () => {
    it('rejects a database name outside the managed "church" namespace', () => {
      expectRejectionReason({
        action: () =>
          resolveDatabaseTarget({
            purpose: 'development',
            worktree: 'develop',
            candidates: {
              development:
                'postgresql://postgres:postgres@localhost:5444/postgres',
            },
          }),
        reason: 'unmanaged-target',
      });
    });
  });

  describe('purpose/name mismatches', () => {
    it('rejects an integration target named for a different worktree', () => {
      expectRejectionReason({
        action: () =>
          resolveDatabaseTarget({
            purpose: 'integration',
            worktree: '246-resolver',
            candidates: {
              development: FEATURE_DEVELOPMENT_URL,
              integration: PRIMARY_INTEGRATION_URL,
            },
          }),
        reason: 'purpose-name-mismatch',
      });
    });

    it('rejects an integration target named for the e2e purpose', () => {
      expectRejectionReason({
        action: () =>
          resolveDatabaseTarget({
            purpose: 'integration',
            worktree: '246-resolver',
            candidates: {
              development: FEATURE_DEVELOPMENT_URL,
              integration: FEATURE_E2E_URL,
            },
          }),
        reason: 'purpose-name-mismatch',
      });
    });

    it('rejects a development target named for the primary worktree while on a feature worktree', () => {
      expectRejectionReason({
        action: () =>
          resolveDatabaseTarget({
            purpose: 'development',
            worktree: '246-resolver',
            candidates: { development: PRIMARY_DEVELOPMENT_URL },
          }),
        reason: 'purpose-name-mismatch',
      });
    });
  });

  describe('development-target guard', () => {
    it('rejects an integration purpose whose target resolves to the development database', () => {
      expectRejectionReason({
        action: () =>
          resolveDatabaseTarget({
            purpose: 'integration',
            worktree: 'develop',
            candidates: {
              development: PRIMARY_DEVELOPMENT_URL,
              integration: PRIMARY_DEVELOPMENT_URL,
            },
          }),
        reason: 'development-target-forbidden',
      });
    });

    it('rejects an e2e purpose whose target resolves to the development database', () => {
      expectRejectionReason({
        action: () =>
          resolveDatabaseTarget({
            purpose: 'e2e',
            worktree: 'develop',
            candidates: {
              development: PRIMARY_DEVELOPMENT_URL,
              e2e: PRIMARY_DEVELOPMENT_URL,
            },
          }),
        reason: 'development-target-forbidden',
      });
    });

    it('does not apply the development-target guard to the development purpose itself', () => {
      expect(() =>
        resolveDatabaseTarget({
          purpose: 'development',
          worktree: 'develop',
          candidates: { development: PRIMARY_DEVELOPMENT_URL },
        }),
      ).not.toThrow();
    });
  });

  describe('NODE_ENV independence', () => {
    it('never reads NODE_ENV to select a purpose', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const identity = resolveDatabaseTarget({
          purpose: 'e2e',
          worktree: 'develop',
          candidates: {
            development: PRIMARY_DEVELOPMENT_URL,
            e2e: PRIMARY_E2E_URL,
          },
        });

        expect(identity.purpose).toBe('e2e');
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe('formatDatabaseTargetPreflight', () => {
    it('reports purpose, worktree, host, port, and database without credentials', () => {
      const identity = resolveDatabaseTarget({
        purpose: 'e2e',
        worktree: 'develop',
        candidates: {
          development: PRIMARY_DEVELOPMENT_URL,
          e2e: PRIMARY_E2E_URL,
        },
      });

      const preflight = formatDatabaseTargetPreflight({ identity });

      expect(preflight).toBe(
        'purpose=e2e worktree=develop host=localhost port=5444 database=church_develop_e2e',
      );
      expect(preflight).not.toContain('postgres:postgres');
    });
  });
});
