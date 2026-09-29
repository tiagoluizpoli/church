import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { removeWorktreeDatabases } from '../../worktree/remove-worktree-databases';

/**
 * The outcomes the `pre-remove` hook reports without a reachable PostgreSQL;
 * dropping, connection termination, and the name guard are covered against
 * a real server in packages/db/tests/drop-databases.test.ts.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const REMOVE_SCRIPT = resolve(
  REPO_ROOT,
  'tooling/worktree/remove-worktree-databases.ts',
);
const LOCAL_ENV_SCRIPT = resolve(REPO_ROOT, 'tooling/worktree/local-env.ts');
const UNREACHABLE_SERVER_URL = 'postgresql://postgres:postgres@127.0.0.1:1';

let sandbox: string;
let primary: string;
let feature: string;

function git(args: string[]): void {
  execFileSync('git', args, { cwd: primary, stdio: 'ignore' });
}

interface CwdInput {
  cwd: string;
}

function generateLocalEnv(input: CwdInput): void {
  execFileSync('bun', [LOCAL_ENV_SCRIPT], { cwd: input.cwd, stdio: 'ignore' });
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'church-remove-'));
  primary = join(sandbox, 'repo');
  feature = join(sandbox, 'repo.feature-a');
  execFileSync('git', ['init', '-q', '-b', 'develop', primary]);
  git(['commit', '-q', '--allow-empty', '-m', 'init']);
  git(['worktree', 'add', '-q', '-b', 'feature-a', feature]);
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('worktree:remove-databases', () => {
  it('drops nothing when the worktree was never bootstrapped', async () => {
    const outcome = await removeWorktreeDatabases({
      cwd: feature,
      serverUrl: UNREACHABLE_SERVER_URL,
    });

    expect(outcome).toEqual({ kind: 'no-identity' });
  });

  it('never drops the primary checkout databases', async () => {
    generateLocalEnv({ cwd: primary });

    const outcome = await removeWorktreeDatabases({
      cwd: primary,
      serverUrl: UNREACHABLE_SERVER_URL,
    });

    expect(outcome).toEqual({ kind: 'primary' });
  });

  it('reports unavailable PostgreSQL instead of failing', async () => {
    generateLocalEnv({ cwd: feature });

    const outcome = await removeWorktreeDatabases({
      cwd: feature,
      serverUrl: UNREACHABLE_SERVER_URL,
    });

    expect(outcome.kind).toBe('unavailable');
  });

  it("reports a feature worktree claiming the primary's identity as a failure", async () => {
    generateLocalEnv({ cwd: feature });
    const path = join(feature, '.env.local');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        'CHURCH_WORKTREE=feature_a',
        'CHURCH_WORKTREE=develop',
      ),
    );

    const outcome = await removeWorktreeDatabases({
      cwd: feature,
      serverUrl: UNREACHABLE_SERVER_URL,
    });

    expect(outcome.kind).toBe('failed');
  });

  it('keeps databases whose identity another active worktree also holds', async () => {
    generateLocalEnv({ cwd: feature });
    const copy = join(sandbox, 'repo.feature-copy');
    git(['worktree', 'add', '-q', '-b', 'feature-copy', copy]);
    writeFileSync(
      join(copy, '.env.local'),
      readFileSync(join(feature, '.env.local'), 'utf8'),
    );

    const outcome = await removeWorktreeDatabases({
      cwd: copy,
      serverUrl: UNREACHABLE_SERVER_URL,
    });

    expect(outcome).toEqual({ kind: 'shared-identity', worktree: 'feature_a' });
  });

  it('exits successfully so the removal proceeds', () => {
    const result = spawnSync('bun', [REMOVE_SCRIPT], {
      cwd: feature,
      encoding: 'utf8',
    });

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('no databases to drop');
  });
});
