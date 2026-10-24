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
    expect(database).toBe(`church_feature_x_reseed_${kind}`);
    expect(isWorktreeDatabaseName({ database })).toBe(true);
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
      expect(database.startsWith(`church_${worktree}_`)).toBe(true);
      expect(isWorktreeDatabaseName({ database })).toBe(true);
    }
    expect(first).not.toBe(second);
  });

  it('refuses an identity that cannot fit a hashed purpose within 63 bytes', () => {
    vi.stubEnv('CHURCH_WORKTREE', 'w'.repeat(52));
    expect(() =>
      scratchDatabaseName({ purpose: 'provision', kind: 'int' }),
    ).toThrow(/63-byte/);
  });

  it.each([
    undefined,
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
