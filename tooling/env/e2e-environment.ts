import { getE2eDatabaseUrl } from '../../packages/db/src/e2e-database-url';

// Dedicated ports for the e2e run, distinct from the ports `bun run dev`
// binds (4000 API / 4001 web) so a run can sit beside a live dev server.
const DEFAULT_SERVER_PORT = '4100';
const DEFAULT_WEB_PORT = '4101';
const DEFAULT_SERVER_URL = 'http://localhost:4000';

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
 * CORS, and authentication URLs are consistent within a process set). The
 * host mirrors whatever `VITE_SERVER_URL` already names; only ports differ.
 */
export function deriveE2eUrlSet(input: DeriveE2eUrlSetInput): E2eUrlSet {
  const serverPort = input.env.PW_SERVER_PORT ?? DEFAULT_SERVER_PORT;
  const webPort = input.env.PW_WEB_PORT ?? DEFAULT_WEB_PORT;
  const host = new URL(input.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL)
    .hostname;

  return {
    serverPort,
    webPort,
    serverUrl: `http://${host}:${serverPort}`,
    webUrl: `http://${host}:${webPort}`,
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
    CHURCH_EXEC_PURPOSE: 'e2e',
    PORT: input.urlSet.serverPort,
    CORS_ORIGIN: input.urlSet.webUrl,
    BETTER_AUTH_URL: input.urlSet.serverUrl,
  };
}

export function webProcessEnv(input: E2eProcessEnvInput): E2eProcessEnv {
  return {
    CHURCH_EXEC_PURPOSE: 'e2e',
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

  getE2eDatabaseUrl();
}
