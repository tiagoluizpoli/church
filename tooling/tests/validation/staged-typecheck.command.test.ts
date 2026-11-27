import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const SCRIPT_PATH = join(REPO_ROOT, 'tooling/validation/staged-typecheck.ts');
const TSC_TIMEOUT_MS = 60_000;
const TSCONFIG = JSON.stringify({
  compilerOptions: { strict: true, noEmit: true, types: [] },
});
const GOOD = 'export const value: string = "a";\n';
const BAD = 'export const value: string = 1;\n';

let root: string;

const write = (path: string, content: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};

const run = (...files: string[]) => {
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, ...files.map((file) => join(root, file))],
    { cwd: root, encoding: 'utf8' },
  );
  return { status: result.status, output: result.stdout + result.stderr };
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'staged-typecheck-'));
  write(
    'package.json',
    JSON.stringify({
      workspaces: { packages: ['apps/web', 'packages/*'] },
    }),
  );
  for (const workspace of ['apps/web', 'apps/desktop', 'packages/core']) {
    write(`${workspace}/tsconfig.json`, TSCONFIG);
  }
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(root, 'node_modules'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('staged type check', () => {
  it(
    'refuses a staged type error, naming the workspace and the fix',
    () => {
      write('apps/web/src/a.ts', BAD);

      const result = run('apps/web/src/a.ts');

      expect(result.status).toBe(1);
      expect(result.output).toContain('src/a.ts(1,14): error TS2322');
      expect(result.output).toContain(
        'Type errors in apps/web: fix them, then stage the result.',
      );
    },
    TSC_TIMEOUT_MS,
  );

  it(
    'checks only the workspaces with staged TypeScript',
    () => {
      write('apps/web/src/a.ts', GOOD);
      write('packages/core/src/broken.ts', BAD);

      const result = run('apps/web/src/a.ts', 'apps/web/src/a.ts');

      expect(result.status).toBe(0);
      expect(result.output).toBe('Type check: apps/web\n');
    },
    TSC_TIMEOUT_MS,
  );

  it(
    'reports every failing workspace in one run',
    () => {
      write('apps/web/src/a.ts', BAD);
      write('packages/core/src/b.tsx', BAD);

      const result = run('apps/web/src/a.ts', 'packages/core/src/b.tsx');

      expect(result.status).toBe(1);
      expect(result.output).toContain('Type errors in apps/web:');
      expect(result.output).toContain('Type errors in packages/core:');
    },
    TSC_TIMEOUT_MS,
  );

  it('ignores files outside the workspaces', () => {
    write('apps/desktop/src/a.ts', BAD);
    write('tooling/a.ts', BAD);

    expect(run('apps/desktop/src/a.ts', 'tooling/a.ts')).toEqual({
      status: 0,
      output: '',
    });
  });

  it('names the bootstrap when TypeScript is not installed', () => {
    rmSync(join(root, 'node_modules'));
    write('apps/web/src/a.ts', GOOD);

    const result = run('apps/web/src/a.ts');

    expect(result.status).toBe(1);
    expect(result.output).toContain('run `bun run worktree:bootstrap`');
  });
});
