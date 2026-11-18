import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';

/**
 * #253: the webServer preflight is the command boundary every E2E process
 * (Fastify, Vite) crosses before it starts. Run it as a real process, the way
 * `start:e2e` and the Playwright web command do, and assert success or
 * refusal through its exit code and redacted output.
 */

const PREFLIGHT = resolve(
  import.meta.dir,
  '../../env/e2e-process-preflight.ts',
);
const SECRET = 'preflight-secret-password';
const FINGERPRINT =
  'purpose=e2e worktree=unspecified host=localhost port=5432 database=church_unspecified_e2e';

type ProcessEnv = Record<string, string>;

/** A run's environment as `playwright.config.ts` hands it to a webServer. */
const RUN_ENV: ProcessEnv = {
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? '',
  CHURCH_EXEC_PURPOSE: 'e2e',
  DATABASE_URL: `postgresql://postgres:${SECRET}@localhost:5432/church_unspecified_e2e`,
  VITE_SERVER_URL: 'http://localhost:4100',
  PW_WEB_URL: 'http://localhost:4101',
  CORS_ORIGIN: 'http://localhost:4101',
  BETTER_AUTH_URL: 'http://localhost:4100',
  CHURCH_E2E_TARGET_FINGERPRINT: FINGERPRINT,
};

interface RunPreflightInput {
  role: string;
  env: ProcessEnv;
}

interface PreflightResult {
  status: number | null;
  output: string;
}

function runPreflight({ role, env }: RunPreflightInput): PreflightResult {
  const result = spawnSync('bun', ['--no-env-file', PREFLIGHT, role], {
    env,
    encoding: 'utf8',
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

describe('e2e-process-preflight', () => {
  it('starts a server process on the run target and logs its fingerprint', () => {
    const { status, output } = runPreflight({
      role: 'server',
      env: { ...RUN_ENV, PORT: '4100' },
    });

    expect(status).toBe(0);
    expect(output).toContain(`[e2e:server] ${FINGERPRINT}`);
    expect(output).not.toContain(SECRET);
  });

  it('refuses a process that resolves a different target than the run pinned', () => {
    const { status, output } = runPreflight({
      role: 'web',
      env: {
        ...RUN_ENV,
        PORT: '4101',
        CHURCH_E2E_TARGET_FINGERPRINT: FINGERPRINT.replace('5432', '5444'),
      },
    });

    expect(status).toBe(1);
    expect(output).toMatch(/different target fingerprint/);
    expect(output).not.toContain(SECRET);
  });

  it('refuses a process bound to a port outside its role', () => {
    const { status, output } = runPreflight({
      role: 'server',
      env: { ...RUN_ENV, PORT: '4000' },
    });

    expect(status).toBe(1);
    expect(output).toMatch(/PORT=4000/);
    expect(output).not.toContain(SECRET);
  });

  it('refuses an unknown role', () => {
    expect(runPreflight({ role: 'worker', env: RUN_ENV }).status).toBe(2);
  });
});
