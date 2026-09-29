import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertE2eEnvironment } from '../../../tooling/env/e2e-environment';
import { readE2eRunFailure } from './fixtures/e2e-run-outcome';
import { E2E_AUTH_META } from './global-setup';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(dirname, '../../server');

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
 * target but this worktree's E2E database. */
export function resetE2eDatabase(): void {
  execFileSync('bun', ['--no-env-file', 'run', 'seed:e2e', 'reset'], {
    cwd: SERVER_DIR,
    stdio: 'inherit',
  });
  rmSync(E2E_AUTH_META, { force: true });
}
