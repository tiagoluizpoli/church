import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWorktreeDatabaseName } from '@/drop-databases';
import { scratchDatabaseName } from '@/scratch-database-name';

afterEach(() => vi.unstubAllEnvs());

describe('scratchDatabaseName', () => {
  it.each([
    'dev',
    'int',
    'e2e',
  ] as const)('names a %s scratch database for the declared worktree', (kind) => {
    vi.stubEnv('CHURCH_WORKTREE', 'feature_x');
    const database = scratchDatabaseName({ purpose: 'reseed', kind });
    expect(database).toBe(`church_feature_x__reseed_${kind}`);
    expect(isWorktreeDatabaseName({ database })).toBe(true);
  });

  it('uses the CI unspecified identity when no worktree is declared', () => {
    vi.stubEnv('CHURCH_WORKTREE', undefined);

    expect(scratchDatabaseName({ purpose: 'reseed', kind: 'int' })).toBe(
      'church_unspecified__reseed_int',
    );
  });

  it('keeps worktrees and purposes distinct and repeatable', () => {
    vi.stubEnv('CHURCH_WORKTREE', 'feature_x');
    const first = scratchDatabaseName({ purpose: 'reseed', kind: 'int' });
    expect(scratchDatabaseName({ purpose: 'reseed', kind: 'int' })).toBe(first);
    expect(scratchDatabaseName({ purpose: 'reset', kind: 'int' })).not.toBe(
      first,
    );
    vi.stubEnv('CHURCH_WORKTREE', 'feature_y');
    expect(scratchDatabaseName({ purpose: 'reseed', kind: 'int' })).not.toBe(
      first,
    );
  });

  it('reserves the scratch namespace between worktree and purpose', () => {
    vi.stubEnv('CHURCH_WORKTREE', 'feature');
    const purposeWithWorktreeSuffix = scratchDatabaseName({
      purpose: 'x_reseed',
      kind: 'dev',
    });
    vi.stubEnv('CHURCH_WORKTREE', 'feature_x');
    const worktreeWithPurposePrefix = scratchDatabaseName({
      purpose: 'reseed',
      kind: 'dev',
    });

    expect(purposeWithWorktreeSuffix).toBe('church_feature__x_reseed_dev');
    expect(worktreeWithPurposePrefix).toBe('church_feature_x__reseed_dev');
    expect(purposeWithWorktreeSuffix).not.toBe(worktreeWithPurposePrefix);

    vi.stubEnv('CHURCH_WORKTREE', 'develop');
    const developScratch = scratchDatabaseName({
      purpose: 'reseed',
      kind: 'dev',
    });

    expect(developScratch).toBe('church_develop__reseed_dev');
    expect(developScratch).not.toBe('church_develop_reseed_dev');
  });

  it('keeps long purposes distinct within 63 bytes without changing ownership', () => {
    const worktree = 'feature_with_a_long_identity__12345678';
    vi.stubEnv('CHURCH_WORKTREE', worktree);
    const purpose = 'a_very_long_database_test_purpose'.repeat(10);
    const first = scratchDatabaseName({ purpose, kind: 'int' });
    const second = scratchDatabaseName({
      purpose: `${purpose}_other`,
      kind: 'int',
    });
    for (const database of [first, second]) {
      expect(Buffer.byteLength(database)).toBeLessThanOrEqual(63);
      expect(database.startsWith(`church_${worktree}__`)).toBe(true);
      expect(isWorktreeDatabaseName({ database })).toBe(true);
    }
    expect(first).not.toBe(second);
  });

  it.each([
    'dev',
    'int',
    'e2e',
  ] as const)('fits distinct hashed purposes for a long identity in a %s database', (kind) => {
    const worktree = 'ticket_602_drop_provision_isolation__7ae1c6a2';
    vi.stubEnv('CHURCH_WORKTREE', worktree);
    const first = scratchDatabaseName({ purpose: 'provision', kind });
    const second = scratchDatabaseName({ purpose: 'reset', kind });

    for (const database of [first, second]) {
      expect(Buffer.byteLength(database)).toBeLessThanOrEqual(63);
      expect(database.startsWith(`church_${worktree}__`)).toBe(true);
      expect(isWorktreeDatabaseName({ database })).toBe(true);
    }
    expect(first).not.toBe(second);
  });

  it('uses a four-character purpose hash when that is all the identity leaves', () => {
    vi.stubEnv('CHURCH_WORKTREE', 'w'.repeat(46));
    const database = scratchDatabaseName({ purpose: 'provision', kind: 'int' });

    expect(database).toMatch(/^church_w{46}__[0-9a-f]{4}_int$/);
  });

  it('refuses a persisted identity longer than the scratch namespace allows', () => {
    const worktree = 'w'.repeat(47);
    vi.stubEnv('CHURCH_WORKTREE', worktree);
    expect(() =>
      scratchDatabaseName({ purpose: 'provision', kind: 'int' }),
    ).toThrow(new RegExp(`${worktree}.*46.*recreate the worktree`, 'i'));
  });

  it.each([
    '',
    'feature-x',
    'Árvore',
    'unsafe"name',
  ])('refuses an undeclared or invalid identity %s instead of guessing ownership', (worktree) => {
    vi.stubEnv('CHURCH_WORKTREE', worktree);
    expect(() =>
      scratchDatabaseName({ purpose: 'reseed', kind: 'int' }),
    ).toThrow(/CHURCH_WORKTREE/);
  });
});
