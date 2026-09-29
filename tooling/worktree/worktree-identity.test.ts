import { describe, expect, it } from 'bun:test';
import { expectedDatabaseName } from '../../packages/db/src/database-target-resolver';
import { deriveWorktreeIdentity } from './worktree-identity';

const POSTGRES_IDENTIFIER_LIMIT = 63;

describe('deriveWorktreeIdentity', () => {
  it('names the primary checkout "develop" whatever branch it has checked out', () => {
    expect(
      deriveWorktreeIdentity({ name: 'some-branch', isPrimary: true }),
    ).toBe('develop');
  });

  it.each([
    [
      '255-worktree-identity-ports-config',
      '255_worktree_identity_ports_config',
    ],
    ['feature-foo', 'feature_foo'],
    ['main', 'main'],
  ])('keeps a plain lowercase branch readable: %s → %s', (name, identity) => {
    expect(deriveWorktreeIdentity({ name, isPrimary: false })).toBe(identity);
  });

  it.each([
    ['Feature/Foo', 'feature_foo__cc4d8924'],
    ['feature_foo', 'feature_foo__968e78bf'],
    ['develop', 'develop__947726dd'],
    ['unspecified', 'unspecified__f416648f'],
    [
      'x-very-long-branch-name-that-keeps-going-well-past-the-postgres-limit',
      'x_very_long_branch_name_that_keeps_going_w__d28927f2',
    ],
  ])('suffixes a hash when the readable form would lose information: %s → %s', (name, identity) => {
    expect(deriveWorktreeIdentity({ name, isPrimary: false })).toBe(identity);
  });

  it('keeps names that normalize alike distinct', () => {
    const identities = ['feature-foo', 'Feature/Foo', 'feature_foo'].map(
      (name) => deriveWorktreeIdentity({ name, isPrimary: false }),
    );

    expect(new Set(identities).size).toBe(identities.length);
  });

  it('always yields database names within the PostgreSQL identifier limit', () => {
    const identity = deriveWorktreeIdentity({
      name: 'a'.repeat(200),
      isPrimary: false,
    });

    for (const purpose of ['development', 'integration', 'e2e'] as const) {
      expect(
        expectedDatabaseName({ purpose, worktree: identity }).length,
      ).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_LIMIT);
    }
  });

  it('falls back to a hashed placeholder when nothing readable survives', () => {
    expect(deriveWorktreeIdentity({ name: '///', isPrimary: false })).toMatch(
      /^worktree__[0-9a-f]{8}$/,
    );
  });
});
