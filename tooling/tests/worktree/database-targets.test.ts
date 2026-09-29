import { describe, expect, it } from 'bun:test';
import {
  type DatabasePurpose,
  resolveDatabaseTarget,
} from '../../../packages/db/src/database-target-resolver';
import { worktreeDatabaseUrls } from '../../worktree/database-targets';

const PURPOSES: DatabasePurpose[] = ['development', 'integration', 'e2e'];

interface DatabaseNamesInput {
  worktree: string;
}

function databaseNames(input: DatabaseNamesInput): string[] {
  const urls = worktreeDatabaseUrls({ worktree: input.worktree });
  return PURPOSES.map((purpose) => new URL(urls[purpose]).pathname.slice(1));
}

describe('worktreeDatabaseUrls', () => {
  it('keeps church for primary development and adds dedicated test databases', () => {
    expect(databaseNames({ worktree: 'develop' })).toEqual([
      'church',
      'church_develop_int',
      'church_develop_e2e',
    ]);
  });

  it('derives three readable databases from a feature worktree identity', () => {
    expect(databaseNames({ worktree: 'feature_a' })).toEqual([
      'church_feature_a_dev',
      'church_feature_a_int',
      'church_feature_a_e2e',
    ]);
  });

  it('points every purpose at the root Compose PostgreSQL', () => {
    const urls = worktreeDatabaseUrls({ worktree: 'feature_a' });

    for (const purpose of PURPOSES) {
      const url = new URL(urls[purpose]);
      expect(`${url.hostname}:${url.port}`).toBe('127.0.0.1:5444');
    }
  });

  for (const worktree of ['develop', 'feature_a', 'feature_b__1a2b3c4d']) {
    it(`gives "${worktree}" targets the resolver accepts for every purpose`, () => {
      const candidates = worktreeDatabaseUrls({ worktree });

      for (const purpose of PURPOSES) {
        expect(() =>
          resolveDatabaseTarget({ purpose, worktree, candidates }),
        ).not.toThrow();
      }
    });
  }
});
