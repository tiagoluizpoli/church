import { describe, expect, it } from 'vitest';
import {
  integrationWorkerDatabaseName,
  isIntegrationWorkerDatabaseName,
} from '../src/integration-worker-database-name';

const WORKTREE = 'ticket_607__79278ca2';

describe('integrationWorkerDatabaseName', () => {
  it('names a worker database after its worktree and worker', () => {
    expect(
      integrationWorkerDatabaseName({ worktree: WORKTREE, workerId: 2 }),
    ).toBe('church_ticket_607__79278ca2__w2_int');
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses worker id %s', (workerId) => {
    expect(() =>
      integrationWorkerDatabaseName({ worktree: WORKTREE, workerId }),
    ).toThrow(/worker id/);
  });

  it('refuses a worker id too long for the PostgreSQL identifier limit', () => {
    expect(() =>
      integrationWorkerDatabaseName({
        worktree: 'a'.repeat(60),
        workerId: 9_999_999_999,
      }),
    ).toThrow(/63/);
  });

  describe('with an identity too long to leave room for a pid', () => {
    const longWorktree = 'tiagoluizpoli_spec_695_inclusive_dat__2c456c23';
    const siblingWorktree = 'tiagoluizpoli_spec_695_inclusive_dat__9f0e1d2c';
    const largePid = 4_194_304;

    it('keeps its full identity for a worker id that still fits', () => {
      expect(
        integrationWorkerDatabaseName({ worktree: longWorktree, workerId: 2 }),
      ).toBe(`church_${longWorktree}__w2_int`);
    });

    it('keeps the full pid within the PostgreSQL identifier limit', () => {
      const name = integrationWorkerDatabaseName({
        worktree: longWorktree,
        workerId: largePid,
      });

      expect(name.length).toBeLessThanOrEqual(63);
      expect(name).toMatch(
        /^church_tiagoluizpoli_spec_695_[a-z0-9_]+__w4194304_int$/,
      );
    });

    it('is deterministic and distinct per identity and per run', () => {
      const name = (worktree: string, workerId: number) =>
        integrationWorkerDatabaseName({ worktree, workerId });

      expect(name(longWorktree, largePid)).toBe(name(longWorktree, largePid));
      expect(name(longWorktree, largePid)).not.toBe(
        name(siblingWorktree, largePid),
      );
      expect(name(longWorktree, largePid)).not.toBe(
        name(longWorktree, largePid - 1),
      );
    });

    it.each([
      2,
      largePid,
    ])('is recognized for its own worktree only with worker id %s, so pruning finds it', (workerId) => {
      const database = integrationWorkerDatabaseName({
        worktree: longWorktree,
        workerId,
      });

      expect(isIntegrationWorkerDatabaseName({ database })).toBe(true);
      expect(
        isIntegrationWorkerDatabaseName({ database, worktree: longWorktree }),
      ).toBe(true);
      expect(
        isIntegrationWorkerDatabaseName({
          database,
          worktree: siblingWorktree,
        }),
      ).toBe(false);
    });
  });
});

describe('isIntegrationWorkerDatabaseName', () => {
  const name = integrationWorkerDatabaseName({
    worktree: WORKTREE,
    workerId: 1,
  });

  it('matches any worktree when none is given', () => {
    expect(isIntegrationWorkerDatabaseName({ database: name })).toBe(true);
  });

  it('matches only the given worktree', () => {
    expect(
      isIntegrationWorkerDatabaseName({ database: name, worktree: WORKTREE }),
    ).toBe(true);
    expect(
      isIntegrationWorkerDatabaseName({ database: name, worktree: 'other' }),
    ).toBe(false);
  });

  it('treats the worktree as a literal, not a pattern', () => {
    expect(
      isIntegrationWorkerDatabaseName({ database: name, worktree: '.*' }),
    ).toBe(false);
  });

  it.each([
    'church_wt_int',
    'church_wt_dev',
    'church_wt__w0_int',
    'church_wt__w1_dev',
    'church__w1_int',
  ])('rejects %s', (database) => {
    expect(isIntegrationWorkerDatabaseName({ database })).toBe(false);
  });
});
