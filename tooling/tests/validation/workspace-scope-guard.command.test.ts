import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

const GUARD = resolve(
  import.meta.dir,
  '../../validation/workspace-scope-guard.ts',
);

let repoDir = '';

const writeWorkspace = (dir: string, content: string): void => {
  mkdirSync(join(repoDir, dir), { recursive: true });
  writeFileSync(join(repoDir, dir, 'package.json'), content);
};

const runGuard = () => {
  const { exitCode, stderr } = Bun.spawnSync(['bun', GUARD], { cwd: repoDir });
  return { exitCode, stderr: stderr.toString() };
};

beforeEach(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'workspace-scope-guard-'));
  writeWorkspace('apps/server', '{"name":"@church/server"}');
  writeWorkspace('packages/db', '{"name":"@church/db"}');
});

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

describe('workspace-scope-guard.ts against a seeded tree', () => {
  it('passes a scoped tree, skipping a directory without a package.json', () => {
    mkdirSync(join(repoDir, 'apps/leftover'), { recursive: true });

    expect(runGuard()).toEqual({ exitCode: 0, stderr: '' });
  });

  it('fails on an unscoped workspace, naming it', () => {
    writeWorkspace('apps/web', '{"name":"web"}');

    expect(runGuard()).toEqual({
      exitCode: 1,
      stderr:
        "apps/web/package.json: workspace name 'web' must start with '@church/'\n",
    });
  });

  it('fails on a package.json it cannot parse instead of skipping it', () => {
    writeWorkspace('apps/web', '{"name":');

    const { exitCode, stderr } = runGuard();

    expect(exitCode).toBe(1);
    expect(stderr).toContain('SyntaxError');
  });
});
