import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertE2eEnvironment } from '../../../tooling/env/e2e-environment';
import { readE2eRunFailure } from './fixtures/e2e-run-outcome';
import { E2E_AUTH_META, E2E_AUTH_META_SCHEMA } from './global-setup';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(dirname, '../../server');

// Set by `test:e2e:ui`: UI mode does not run the configured reporters, so its
// teardown cannot tell a failed session from a passing one.
const KEEP_STATE_VARIABLE = 'CHURCH_E2E_KEEP_STATE';

/** Removes the seeded E2E domain data (church cascade + pool users) after a
 * passing run. A failed run or a UI session keeps it for diagnosis; the next
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
  cleanupE2eData();
}

/** Deletes the seeded data without re-running the preflight — callers must
 * already have passed `assertE2eEnvironment`. */
export function cleanupE2eData(): void {
  const args = ['run', 'seed:e2e', 'cleanup'];

  if (existsSync(E2E_AUTH_META)) {
    const rawMeta = readFileSync(E2E_AUTH_META, 'utf8');
    const meta = E2E_AUTH_META_SCHEMA.parse(JSON.parse(rawMeta));

    if (meta.leaderUserId) {
      args.push(`--leader-user-id=${meta.leaderUserId}`);
    }

    if (meta.ministryLeaderUserId) {
      args.push(`--ministry-leader-user-id=${meta.ministryLeaderUserId}`);
    }

    if (meta.teamLeaderUserId) {
      args.push(`--team-leader-user-id=${meta.teamLeaderUserId}`);
    }

    if (meta.volunteerUserId) {
      args.push(`--volunteer-user-id=${meta.volunteerUserId}`);
    }

    if (meta.churchBAdminUserId) {
      args.push(`--church-b-admin-user-id=${meta.churchBAdminUserId}`);
    }
  }

  execFileSync('bun', ['--no-env-file', ...args], {
    cwd: SERVER_DIR,
    stdio: 'inherit',
  });

  if (existsSync(E2E_AUTH_META)) {
    rmSync(E2E_AUTH_META, { force: true });
  }
}
