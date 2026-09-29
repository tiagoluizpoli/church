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
 * The real apps/server schema beneath the real root schema: a value the
 * worktree sets at the root must reach the server rather than being shadowed
 * by a default the service schema declares.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const VARLOCK = resolve(REPO_ROOT, 'node_modules/.bin/varlock');

const REQUIRED_SERVER_VALUES = [
  'DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5444/church',
  'BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef',
  'BETTER_AUTH_URL=http://localhost:3000',
  'CORS_ORIGIN=http://localhost:3001',
  'UNLEASH_API_URL=http://localhost:4242/api',
  'UNLEASH_API_TOKEN=token',
];

let rootDir: string;
let serverDir: string;

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'church-server-schema-'));
  serverDir = join(rootDir, 'apps/server');
  mkdirSync(serverDir, { recursive: true });
  copyFileSync(join(REPO_ROOT, '.env.schema'), join(rootDir, '.env.schema'));
  copyFileSync(
    join(REPO_ROOT, 'apps/server/.env.schema'),
    join(serverDir, '.env.schema'),
  );
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

interface ServerValueInput {
  rootValues: string[];
  key: string;
}

function serverValue(input: ServerValueInput): string {
  writeFileSync(
    join(rootDir, '.env'),
    [...REQUIRED_SERVER_VALUES, ...input.rootValues, ''].join('\n'),
  );

  return execFileSync(VARLOCK, ['printenv', '--path', serverDir, input.key], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, CHURCH_EXEC_PURPOSE: 'e2e' },
  }).trim();
}

describe('apps/server .env.schema', () => {
  it('lets the root enable debug endpoints', () => {
    expect(
      serverValue({
        rootValues: ['ENABLE_DEBUG_ENDPOINTS=true'],
        key: 'ENABLE_DEBUG_ENDPOINTS',
      }),
    ).toBe('true');
  });

  it('leaves debug endpoints unset when the root does not enable them', () => {
    expect(
      serverValue({ rootValues: [], key: 'ENABLE_DEBUG_ENDPOINTS' }),
    ).not.toBe('true');
  });
});
