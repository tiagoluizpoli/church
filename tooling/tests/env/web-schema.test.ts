import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * The real apps/web schema beneath the real root schema: `bun run dev` binds
 * the worktree's CHURCH_WEB_PORT, while CI, which has no generated
 * `.env.local`, still loads without one.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const VARLOCK = resolve(REPO_ROOT, 'node_modules/.bin/varlock');

let rootDir: string;
let webDir: string;

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'church-web-schema-'));
  webDir = join(rootDir, 'apps/web');
  mkdirSync(webDir, { recursive: true });
  copyFileSync(join(REPO_ROOT, '.env.schema'), join(rootDir, '.env.schema'));
  copyFileSync(
    join(REPO_ROOT, 'apps/web/.env.schema'),
    join(webDir, '.env.schema'),
  );
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

interface WebPortInput {
  rootValues: string[];
}

function webPort(input: WebPortInput): string {
  writeFileSync(
    join(rootDir, '.env'),
    ['VITE_SERVER_URL=http://localhost:4100', ...input.rootValues, ''].join(
      '\n',
    ),
  );

  return execFileSync(VARLOCK, ['printenv', '--path', webDir, 'PORT'], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, CHURCH_EXEC_PURPOSE: 'e2e' },
  }).trim();
}

interface ServerUrlInput {
  value: string;
}

/** The value Varlock resolves for this server URL, or `invalid`. */
function loadServerUrl(input: ServerUrlInput): string {
  writeFileSync(join(rootDir, '.env'), `VITE_SERVER_URL=${input.value}\n`);

  try {
    return execFileSync(
      VARLOCK,
      ['printenv', '--path', webDir, 'VITE_SERVER_URL'],
      {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, CHURCH_EXEC_PURPOSE: 'development' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
  } catch {
    return 'invalid';
  }
}

describe('apps/web .env.schema', () => {
  it.each([
    'http://localhost:4100',
    'https://church-feature-a.dev.home.arpa:27520',
    '/',
  ])('accepts VITE_SERVER_URL=%s', (value) => {
    expect(loadServerUrl({ value })).toBe(value);
  });

  it.each([
    '/api',
    'localhost:4100',
    'ftp://localhost',
  ])('rejects VITE_SERVER_URL=%s', (value) => {
    expect(loadServerUrl({ value })).toBe('invalid');
  });

  it('still requires VITE_SERVER_URL', () => {
    expect(loadServerUrl({ value: '' })).toBe('invalid');
  });

  it('binds the worktree web port', () => {
    expect(webPort({ rootValues: ['CHURCH_WEB_PORT=31133'] })).toBe('31133');
  });

  it('leaves PORT unset without a worktree port, as in CI', () => {
    expect(webPort({ rootValues: [] })).toBe('');
  });
});
