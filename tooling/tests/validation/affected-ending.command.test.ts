import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  readCleanTree,
  readMergeBase,
  recordPass,
} from '../../validation/gate-pass';

/**
 * The real CLI on the paths that end a run before any stage starts (a stage
 * would run in this checkout), against a temporary repository and HOME.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const SCRIPT_PATH = join(REPO_ROOT, 'tooling/validation/affected.ts');

let repo: string;
let home: string;

const git = (...args: string[]) => {
  const { exitCode, stderr } = Bun.spawnSync(['git', ...args], { cwd: repo });
  if (exitCode !== 0) throw new Error(stderr.toString());
};

const commitFile = ({ path }: { path: string }) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), 'export const x = 1;\n');
  git('add', '-A');
  git('commit', '-q', '-m', `change ${path}`);
};

const run = () => {
  const result = Bun.spawnSync(['bun', SCRIPT_PATH], {
    cwd: repo,
    env: {
      ...process.env,
      CHURCH_VALIDATE_LOCK_TIMEOUT_MS: '1',
      CI: '',
      GITHUB_STEP_SUMMARY: '',
      HOME: home,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return {
    ending: result.stdout.toString().trimEnd().split('\n').slice(-2),
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
};

const stateDir = () => join(home, '.local', 'state', 'church');

/** A live holder, so no run in these tests can ever start validating. */
const holdSlot = () => {
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(
    join(stateDir(), 'validate.lock.json'),
    JSON.stringify({
      pid: process.pid,
      startedAt: performance.timeOrigin,
      tier: 'affected',
      worktree: 'elsewhere',
    }),
  );
};

const headTree = () =>
  Bun.spawnSync(['git', 'rev-parse', 'HEAD^{tree}'], { cwd: repo })
    .stdout.toString()
    .trim();

const failedEnding = ({ code }: { code: number }) => [
  `VALIDATE_AFFECTED: FAILED ${headTree()}`,
  `EXIT ${code}`,
];

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'affected-ending-repo-'));
  home = mkdtempSync(join(tmpdir(), 'affected-ending-home-'));
  git('init', '-q', '-b', 'develop');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  commitFile({ path: 'README.md' });
  git('checkout', '-q', '-b', 'feature/x');
  holdSlot();
});

afterEach(() => {
  rmSync(repo, { force: true, recursive: true });
  rmSync(home, { force: true, recursive: true });
});

describe('affected.ts run that ends before any stage', () => {
  it('exits 1 while seed impact is undecided', () => {
    commitFile({
      path: 'apps/server/src/infrastructure/repositories/drizzle-x.ts',
    });

    const { ending, exitCode, stderr } = run();

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Nothing was validated.');
    expect(ending).toEqual(failedEnding({ code: 1 }));
  });

  it('exits 0 when the tree already passed', () => {
    commitFile({ path: 'apps/web/src/x.ts' });
    const tree = readCleanTree({ cwd: repo });
    const base = readMergeBase({ baseRef: 'develop', cwd: repo });
    if (!tree || !base) throw new Error('expected a clean tree and a base');
    recordPass({ base, cwd: repo, dir: stateDir(), tier: 'affected', tree });

    const { ending, exitCode, stdout } = run();

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Skipping validation:');
    expect(ending).toEqual([`VALIDATE_AFFECTED: PASSED ${tree}`, 'EXIT 0']);
  });

  it('exits 75 when the validate slot stays busy', () => {
    commitFile({ path: 'apps/web/src/x.ts' });

    const { ending, exitCode, stderr } = run();

    expect(exitCode).toBe(75);
    expect(stderr).toContain('Nothing was validated');
    expect(ending).toEqual(failedEnding({ code: 75 }));
  });

  it('marks a tree with uncommitted work', () => {
    writeFileSync(join(repo, 'scratch.txt'), 'x');

    const { ending } = run();

    expect(ending[0]).toBe(
      `VALIDATE_AFFECTED: FAILED ${headTree()}+uncommitted`,
    );
  });

  it('adds no ending to a dry run, whose stdout is parsed as JSON', () => {
    const result = Bun.spawnSync(['bun', SCRIPT_PATH, '--dry-run'], {
      cwd: repo,
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(() => JSON.parse(result.stdout.toString())).not.toThrow();
  });

  it('exits 1 when the configured base does not resolve', () => {
    git('config', 'branch.feature/x.validateBase', 'spec/9-deleted');

    const { ending, exitCode, stderr } = run();

    expect(exitCode).toBe(1);
    expect(stderr).toContain('"spec/9-deleted", which does not resolve');
    expect(ending).toEqual(failedEnding({ code: 1 }));
  });
});
