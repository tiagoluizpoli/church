import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * #253: proves every step of an E2E journey ran against the database target
 * `playwright.config.ts` pinned for the run (`CHURCH_E2E_TARGET_FINGERPRINT`).
 * The server stamps its resolved target on every response
 * (apps/server/src/api/utils/e2e-target-header.ts); a server script logs it
 * as its preflight line (packages/db/src/e2e-database-url.ts). The original
 * failure — an invitation provisioned in one database and redeemed in
 * another — fails here, naming the step, instead of as INVITATION_NOT_FOUND.
 */
export const E2E_TARGET_HEADER = 'x-church-e2e-target';

const FINGERPRINT_VARIABLE = 'CHURCH_E2E_TARGET_FINGERPRINT';
const PREFLIGHT_LINE = /^purpose=\S+ worktree=/;

const dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(dirname, '../../../server');

function pinnedE2eFingerprint(): string {
  const pinned = process.env[FINGERPRINT_VARIABLE];
  if (!pinned) {
    throw new Error(
      `${FINGERPRINT_VARIABLE} is not set: run E2E through \`bun run test:e2e\` so the Playwright config pins the target.`,
    );
  }
  return pinned;
}

/** The slice of a Playwright `APIResponse` / `Response` this check reads. */
export interface E2eServedResponse {
  headers(): Record<string, string>;
  url(): string;
}

export interface AssertServedFromPinnedTargetInput {
  response: E2eServedResponse;
  step: string;
}

export function assertServedFromPinnedTarget(
  input: AssertServedFromPinnedTargetInput,
): void {
  const pinned = pinnedE2eFingerprint();
  const served = input.response.headers()[E2E_TARGET_HEADER];

  if (served !== pinned) {
    throw new Error(
      `E2E step "${input.step}" was served from ${served ?? 'an unreported target'} (${input.response.url()}), not the pinned target ${pinned}.`,
    );
  }
}

export interface AssertReportedPinnedTargetInput {
  output: string;
  step: string;
}

export function assertReportedPinnedTarget(
  input: AssertReportedPinnedTargetInput,
): void {
  const pinned = pinnedE2eFingerprint();
  const reported = input.output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => PREFLIGHT_LINE.test(line));
  const foreign = reported.filter((line) => line !== pinned);

  if (reported.length === 0 || foreign.length > 0) {
    throw new Error(
      `E2E step "${input.step}" reported ${reported.length === 0 ? 'no target' : foreign.join(', ')}, not the pinned target ${pinned}.`,
    );
  }
}

export interface RunE2eServerScriptInput {
  scriptPath: string;
  args: string[];
  step: string;
}

/**
 * Runs an `apps/server` E2E script in this process's environment (the e2e
 * purpose, target, and URL set the run pinned). `--no-env-file` keeps a value
 * file in the working directory from changing its target; the script's
 * preflight line must then match the pinned target. Returns its stdout.
 */
export function runE2eServerScript(input: RunE2eServerScriptInput): string {
  const output = execFileSync(
    'bun',
    ['--no-env-file', 'run', input.scriptPath, ...input.args],
    { cwd: SERVER_DIR },
  ).toString();

  assertReportedPinnedTarget({ output, step: input.step });

  return output;
}
