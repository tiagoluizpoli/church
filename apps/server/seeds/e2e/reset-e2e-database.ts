import { resetE2eDatabase } from '@church/db/e2e-database-reset';

/**
 * Empties this worktree's E2E database: Playwright global setup runs it
 * before loading the suite, and global teardown after a passing run. It
 * prints the redacted target preflight line, and refuses every target but
 * the E2E database, before it connects.
 */
if (import.meta.main) {
  resetE2eDatabase()
    .then(() => console.log('[e2e-reset] E2E database emptied'))
    .catch((error: unknown) => {
      console.error('[e2e-reset] failed:', error);
      process.exit(1);
    });
}
