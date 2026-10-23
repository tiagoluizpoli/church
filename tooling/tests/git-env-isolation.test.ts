import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Git hooks (lefthook's pre-push runs validate:affected) export GIT_DIR and
 * friends. Tooling tests run `git init/commit/config` in temp dirs with the
 * inherited env, so without the bunfig preload those commands hit the repo
 * the hook is running in.
 */

const REPO_ROOT = resolve(import.meta.dir, '../..');

let sentinelDir: string;

function git(args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], {
    cwd: sentinelDir,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`);
  }
  return result.stdout.toString();
}

function sentinelState() {
  return {
    config: readFileSync(join(sentinelDir, '.git/config'), 'utf8'),
    refs: git(['for-each-ref']),
  };
}

beforeEach(() => {
  sentinelDir = mkdtempSync(join(tmpdir(), 'git-env-sentinel-'));
  git(['init', '--quiet', '-b', 'main']);
  git(['config', 'user.email', 'sentinel@example.com']);
  git(['config', 'user.name', 'Sentinel']);
  git(['commit', '--quiet', '--allow-empty', '-m', 'sentinel']);
});

afterEach(() => {
  rmSync(sentinelDir, { force: true, recursive: true });
});

describe('tooling tests under an inherited git hook environment', () => {
  it('leave the repository named by GIT_DIR untouched', () => {
    const before = sentinelState();

    const result = Bun.spawnSync(
      [
        'bun',
        'test',
        'tooling/tests/validation/affected.command.test.ts',
        '-t',
        'committed-only clean branch',
      ],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          GIT_DIR: join(sentinelDir, '.git'),
          GIT_WORK_TREE: sentinelDir,
        },
        stderr: 'pipe',
        stdout: 'pipe',
      },
    );

    expect(result.stderr.toString()).toContain(' 1 pass');
    expect(sentinelState()).toEqual(before);
  }, 60_000);
});
