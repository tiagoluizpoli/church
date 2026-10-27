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

  it('refuses a name beyond the PostgreSQL identifier limit', () => {
    expect(() =>
      integrationWorkerDatabaseName({
        worktree: 'a'.repeat(60),
        workerId: 1,
      }),
    ).toThrow(/63/);
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
