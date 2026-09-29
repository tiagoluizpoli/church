import { formatDatabaseTargetPreflight } from '../../packages/db/src/database-target-resolver';
import {
  getE2eDatabaseUrl,
  resolveE2eDatabaseTarget,
} from '../../packages/db/src/e2e-database-url';

const E2E_PURPOSE = 'e2e';
const FINGERPRINT_VARIABLE = 'CHURCH_E2E_TARGET_FINGERPRINT';

// Dedicated ports for the e2e run, distinct from the ports `bun run dev`
// binds (4000 API / 4001 web) so a run can sit beside a live dev server.
const DEFAULT_SERVER_PORT = '4100';
const DEFAULT_WEB_PORT = '4101';
// Loopback, never the manual worktree hostname: E2E and CI must not depend
// on private DNS (ADR-0005).
const E2E_HOSTNAME = 'localhost';

export interface E2eUrlSet {
  serverPort: string;
  webPort: string;
  serverUrl: string;
  webUrl: string;
}

export interface DeriveE2eUrlSetInput {
  env: NodeJS.ProcessEnv;
}

/**
 * Derives the one URL set every E2E process shares (ADR-0005: server, web,
 * CORS, and authentication URLs are consistent within a process set), on
 * loopback whatever host the manual `VITE_SERVER_URL` names.
 */
export function deriveE2eUrlSet(input: DeriveE2eUrlSetInput): E2eUrlSet {
  const serverPort = input.env.PW_SERVER_PORT ?? DEFAULT_SERVER_PORT;
  const webPort = input.env.PW_WEB_PORT ?? DEFAULT_WEB_PORT;
  return {
    serverPort,
    webPort,
    serverUrl: `http://${E2E_HOSTNAME}:${serverPort}`,
    webUrl: `http://${E2E_HOSTNAME}:${webPort}`,
  };
}

/** Environment variables carrying the URL set: the single mapping both
 * `applyE2eUrlSet` and the preflight use, so they cannot drift apart. */
export type E2eUrlVariables = Record<string, string>;

interface UrlVariablesInput {
  urlSet: E2eUrlSet;
}

function urlVariables(input: UrlVariablesInput): E2eUrlVariables {
  return {
    VITE_SERVER_URL: input.urlSet.serverUrl,
    PW_WEB_URL: input.urlSet.webUrl,
    CORS_ORIGIN: input.urlSet.webUrl,
    BETTER_AUTH_URL: input.urlSet.serverUrl,
  };
}

export interface ApplyE2eUrlSetInput {
  env: NodeJS.ProcessEnv;
  urlSet: E2eUrlSet;
}

/**
 * Pins the URL set into `env` so every consumer that inherits it (global
 * setup, provisioning/mint/redeem scripts, seed, teardown) sees this run's
 * origins instead of whatever a value file carries for `bun run dev`.
 * `PW_WEB_URL` is for specs that build a second browser context.
 */
export function applyE2eUrlSet(input: ApplyE2eUrlSetInput): void {
  Object.assign(input.env, urlVariables({ urlSet: input.urlSet }));
}

/** Environment variables handed to one Playwright `webServer` process. */
export type E2eProcessEnv = Record<string, string>;

export interface E2eProcessEnvInput {
  urlSet: E2eUrlSet;
}

export function serverProcessEnv(input: E2eProcessEnvInput): E2eProcessEnv {
  return {
    CHURCH_EXEC_PURPOSE: E2E_PURPOSE,
    PORT: input.urlSet.serverPort,
    CORS_ORIGIN: input.urlSet.webUrl,
    BETTER_AUTH_URL: input.urlSet.serverUrl,
  };
}

export function webProcessEnv(input: E2eProcessEnvInput): E2eProcessEnv {
  return {
    CHURCH_EXEC_PURPOSE: E2E_PURPOSE,
    PORT: input.urlSet.webPort,
    VITE_SERVER_URL: input.urlSet.serverUrl,
  };
}

export class E2eEnvironmentMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'E2eEnvironmentMismatchError';
  }
}

/**
 * Preflight for the Playwright process, run before any provisioning or
 * destructive cleanup. Fails when the inherited URL set disagrees with the
 * run's, when the purpose is not `e2e`, or when the database target is not
 * this worktree's E2E database. A passing check logs the same redacted
 * target fingerprint every other E2E support process logs.
 */
export function assertE2eEnvironment(): void {
  assertUrlSetConsistent();
  getE2eDatabaseUrl();
}

function assertUrlSetConsistent(): void {
  const expected = urlVariables({
    urlSet: deriveE2eUrlSet({ env: process.env }),
  });
  const mismatched = Object.keys(expected).filter(
    (key) => process.env[key] !== expected[key],
  );

  if (mismatched.length > 0) {
    throw new E2eEnvironmentMismatchError(
      `E2E URL set is inconsistent: ${mismatched
        .map(
          (key) =>
            `${key}=${process.env[key] ?? '<unset>'} (expected ${expected[key]})`,
        )
        .join(', ')}.`,
    );
  }
}

/**
 * The redacted database-target fingerprint the whole run is pinned to. The
 * Playwright config computes it once (when a database is configured) and
 * every child process inherits it as `CHURCH_E2E_TARGET_FINGERPRINT`.
 */
export function resolveE2eTargetFingerprint(): string {
  return formatDatabaseTargetPreflight({
    identity: resolveE2eDatabaseTarget().identity,
  });
}

export type E2eProcessRole = 'server' | 'web';

export interface AssertE2eProcessEnvironmentInput {
  role: E2eProcessRole;
}

/**
 * Per-process preflight for the webServer processes (Fastify, Vite): run in
 * the process's own environment before it starts. Fails when the purpose,
 * URL set, or bound `PORT` disagree with the run, or when the process
 * resolves a different database target than the fingerprint the run pinned.
 * Passing logs that fingerprint, so every process reports the same line.
 */
export function assertE2eProcessEnvironment(
  input: AssertE2eProcessEnvironmentInput,
): void {
  assertUrlSetConsistent();

  const urlSet = deriveE2eUrlSet({ env: process.env });
  const expectedPort =
    input.role === 'server' ? urlSet.serverPort : urlSet.webPort;

  if (process.env.PORT !== expectedPort) {
    throw new E2eEnvironmentMismatchError(
      `E2E ${input.role} process has PORT=${process.env.PORT ?? '<unset>'} (expected ${expectedPort}).`,
    );
  }

  const pinned = process.env[FINGERPRINT_VARIABLE];

  if (!pinned) {
    throw new E2eEnvironmentMismatchError(
      `${FINGERPRINT_VARIABLE} is not set: the run did not pin a target for this ${input.role} process.`,
    );
  }

  const resolved = resolveE2eTargetFingerprint();

  if (resolved !== pinned) {
    throw new E2eEnvironmentMismatchError(
      `E2E ${input.role} process resolved a different target fingerprint (${resolved}) than the run pinned (${pinned}).`,
    );
  }

  console.log(`[e2e:${input.role}] ${resolved}`);
}

/** Pins the run's target fingerprint into `env` when a database is configured
 * (a `playwright test --list` run has none and needs none). */
export function pinE2eTargetFingerprint(input: PinE2eTargetInput): void {
  if (input.env.DATABASE_URL && input.env.CHURCH_EXEC_PURPOSE === E2E_PURPOSE) {
    input.env[FINGERPRINT_VARIABLE] = resolveE2eTargetFingerprint();
  }
}

interface PinE2eTargetInput {
  env: NodeJS.ProcessEnv;
}
