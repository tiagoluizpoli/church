import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  E2E_RUN_FAILURE_MARKER,
  readE2eRunFailure,
  recordE2eRunFailure,
} from './fixtures/e2e-run-outcome';
import globalSetup from './global-setup';
import globalTeardown from './global-teardown';

// #260: drives the real global setup and teardown with a component failure
// instead of a database. The environment's URL set is deliberately
// inconsistent, so setup fails its preflight and teardown's cleanup would
// throw the same mismatch: teardown returning quietly proves it kept the
// failed run's state instead of cleaning it.

const ENV_KEYS = ['PW_WEB_URL', 'CHURCH_E2E_KEEP_STATE'] as const;
let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>>;
let savedMarker: string | undefined;

beforeEach(() => {
  savedMarker = existsSync(E2E_RUN_FAILURE_MARKER)
    ? readFileSync(E2E_RUN_FAILURE_MARKER, 'utf8')
    : undefined;
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  rmSync(E2E_RUN_FAILURE_MARKER, { force: true });
  delete process.env.CHURCH_E2E_KEEP_STATE;
  process.env.PW_WEB_URL = 'http://mismatched.invalid:1';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(E2E_RUN_FAILURE_MARKER, { force: true });
  if (savedMarker !== undefined) {
    writeFileSync(E2E_RUN_FAILURE_MARKER, savedMarker);
  }
});

describe('E2E run lifecycle', () => {
  it('keeps the state of a run whose global setup failed', async () => {
    recordE2eRunFailure({ reason: 'a previous run failed' });

    await expect(globalSetup()).rejects.toThrow(/URL set is inconsistent/);

    expect(readE2eRunFailure()).toMatch(
      /^global setup failed: E2E URL set is inconsistent/,
    );
    expect(() => globalTeardown()).not.toThrow();
  });

  it('keeps the state of a run whose tests failed', () => {
    recordE2eRunFailure({ reason: 'redeems failed' });

    expect(() => globalTeardown()).not.toThrow();
  });

  it('keeps the state when a UI session ends', () => {
    process.env.CHURCH_E2E_KEEP_STATE = '1';

    expect(() => globalTeardown()).not.toThrow();
  });

  it('cleans after a passing run', () => {
    expect(() => globalTeardown()).toThrow(/URL set is inconsistent/);
  });
});
