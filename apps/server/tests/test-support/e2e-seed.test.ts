import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetE2eDatabase, seedE2e } from '../../src/test-support/e2e-seed';

function resetEnv(): void {
  delete process.env.CHURCH_EXEC_PURPOSE;
  delete process.env.DATABASE_URL;
  delete process.env.DEVELOPMENT_DATABASE_URL;
  delete process.env.CHURCH_WORKTREE;
}

describe('e2e-seed target resolution', () => {
  afterEach(() => {
    resetEnv();
    vi.restoreAllMocks();
  });

  it('seedE2e refuses to run without the e2e purpose, before touching any connection', async () => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5444/church';

    await expect(
      seedE2e({
        leaderUserId: 'leader',
        ministryLeaderUserId: 'ministry-leader',
        teamLeaderUserId: 'team-leader',
        volunteerUserId: 'volunteer',
        churchBAdminUserId: 'church-b-admin',
      }),
    ).rejects.toThrow(/requires CHURCH_EXEC_PURPOSE=e2e/);
  });

  it('resetE2eDatabase refuses to target the development database', async () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5444/church';
    process.env.DEVELOPMENT_DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5444/church';
    process.env.CHURCH_WORKTREE = 'develop';

    await expect(resetE2eDatabase()).rejects.toThrow(
      /may not target the development database/,
    );
  });

  it('resetE2eDatabase refuses an unmanaged database', async () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5444/postgres';
    process.env.DEVELOPMENT_DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5444/church';
    process.env.CHURCH_WORKTREE = 'develop';

    await expect(resetE2eDatabase()).rejects.toThrow(
      /is outside the managed "church" namespace/,
    );
  });
});
