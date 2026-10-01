import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { withoutEnclosingVarlockConfig } from '../../env/e2e-environment';

/**
 * CI shape of the E2E web server: Playwright runs inside the server
 * schema's `varlock run`, and the web server starts its own `varlock run`
 * against the web schema. CI has no value files, so every value comes from
 * the process environment. Uses the real root, server and web schemas.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const VARLOCK = resolve(REPO_ROOT, 'node_modules/.bin/varlock');
const SCHEMAS = [
  '.env.schema',
  'apps/server/.env.schema',
  'apps/web/.env.schema',
];

// What the CI E2E job and Playwright's webServer env provide.
const CI_ENVIRONMENT = {
  CHURCH_EXEC_PURPOSE: 'e2e',
  DATABASE_URL:
    'postgresql://postgres:postgres@localhost:5432/church_unspecified_e2e',
  BETTER_AUTH_SECRET: '0123456789abcdef0123456789abcdef',
  BETTER_AUTH_URL: 'http://localhost:4100',
  CORS_ORIGIN: 'http://localhost:4101',
  UNLEASH_API_URL: 'http://localhost:4242/api',
  UNLEASH_API_TOKEN: 'ci-placeholder-unleash-token',
  VITE_SERVER_URL: 'http://localhost:4100',
  PORT: '4101',
};

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'church-nested-varlock-'));
  for (const schema of SCHEMAS) {
    mkdirSync(join(root, schema, '..'), { recursive: true });
    copyFileSync(join(REPO_ROOT, schema), join(root, schema));
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the E2E web server under an enclosing server-schema Varlock run', () => {
  it('resolves the web schema from the real environment', () => {
    const output = join(root, 'web-env.json');
    const webServer = withoutEnclosingVarlockConfig({
      command: `${VARLOCK} run --path ${join(root, 'apps/web')} -- sh -c 'printf "%s %s" "$VITE_SERVER_URL" "$PORT" > ${output}'`,
    });

    const result = spawnSync(
      VARLOCK,
      ['run', '--path', join(root, 'apps/server'), '--', 'sh', '-c', webServer],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          ...CI_ENVIRONMENT,
        },
      },
    );

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe('http://localhost:4100 4101');
  });
});
