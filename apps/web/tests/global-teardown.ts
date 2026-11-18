import { rmSync } from 'node:fs';
import { assertE2eEnvironment } from '../../../tooling/env/e2e-environment';
import { readE2eRunFailure } from './fixtures/e2e-run-outcome';
import { runE2eServerScript } from './fixtures/e2e-target';
import { SHARED_PERSONAS_FILE } from './fixtures/shared-personas';

// Set by `test:e2e:ui`: UI mode does not run the configured reporters, so its
// teardown cannot tell a failed session from a passing one.
const KEEP_STATE_VARIABLE = 'CHURCH_E2E_KEEP_STATE';

/** Empties the E2E database after a passing run. A failed run or a UI session keeps it for diagnosis; the next
 * run's global setup resets the target before seeding. */
export default function globalTeardown(): void {
  const failure = readE2eRunFailure();
  const keepReason = failure
    ? `E2E run failed (${failure})`
    : process.env[KEEP_STATE_VARIABLE] === '1'
      ? 'E2E UI session ended'
      : undefined;

  if (keepReason) {
    console.warn(
      `⚠ ${keepReason}: keeping the E2E database state for diagnosis. The next E2E run resets it.`,
    );
    return;
  }

  // Cleanup deletes data: refuse a mismatched purpose, target, or URL set.
  assertE2eEnvironment();
  resetE2eDatabase();
}

/** Empties the E2E database without re-running the preflight — callers must
 * already have passed `assertE2eEnvironment`. The server script refuses any
 * target but this worktree's E2E database, and its preflight line must name
 * the target the run pinned. */
export function resetE2eDatabase(): void {
  runE2eServerScript({
    scriptPath: 'seeds/e2e/reset-e2e-database.ts',
    args: [],
    step: 'reset the E2E database',
  });
  rmSync(SHARED_PERSONAS_FILE, { force: true });
}
