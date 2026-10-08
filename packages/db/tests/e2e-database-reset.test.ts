import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetE2eDatabase } from '../src/e2e-database-reset';

const DEVELOPMENT_URL = 'postgresql://postgres:postgres@localhost:5444/church';

function resetEnv(): void {
  delete process.env.CHURCH_EXEC_PURPOSE;
  delete process.env.DATABASE_URL;
  delete process.env.DEVELOPMENT_DATABASE_URL;
  delete process.env.CHURCH_WORKTREE;
}

/** Every refusal happens before a pool exists, so no database is touched. */
describe('resetE2eDatabase target resolution', () => {
  afterEach(() => {
    resetEnv();
    vi.restoreAllMocks();
  });

  it('refuses to run without the e2e purpose', async () => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL = DEVELOPMENT_URL;

    await expect(resetE2eDatabase()).rejects.toThrow(
      /requires CHURCH_EXEC_PURPOSE=e2e/,
    );
  });

  it('refuses to target the development database', async () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL = DEVELOPMENT_URL;
    process.env.DEVELOPMENT_DATABASE_URL = DEVELOPMENT_URL;
    process.env.CHURCH_WORKTREE = 'develop';

    await expect(resetE2eDatabase()).rejects.toThrow(
      /may not target the development database/,
    );
  });

  it('refuses an unmanaged database', async () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5444/postgres';
    process.env.DEVELOPMENT_DATABASE_URL = DEVELOPMENT_URL;
    process.env.CHURCH_WORKTREE = 'develop';

    await expect(resetE2eDatabase()).rejects.toThrow(
      /is outside the managed "church" namespace/,
    );
  });
});
