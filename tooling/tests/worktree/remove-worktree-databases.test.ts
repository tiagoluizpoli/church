import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Instant } from '../../../packages/time/src';
import {
  removeWorktreeDatabases,
  reportRemoval,
} from '../../worktree/remove-worktree-databases';

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

interface DirInput {
  dir: string;
}

function bundlesIn(input: DirInput): string[] {
  return existsSync(input.dir) ? readdirSync(input.dir) : [];
}

function git(args: string[]): void {
  execFileSync('git', args, { cwd: primary, stdio: 'ignore' });
}

interface CwdInput {
  cwd: string;
}

function generateLocalEnv(input: CwdInput): void {
  execFileSync('bun', [LOCAL_ENV_SCRIPT], { cwd: input.cwd, stdio: 'ignore' });
}

// CI points bundles at runner storage; these tests assert the default.
const bundlesDirOverride = process.env.CHURCH_FAILURE_BUNDLES_DIR;

beforeEach(() => {
  delete process.env.CHURCH_FAILURE_BUNDLES_DIR;
  sandbox = mkdtempSync(join(tmpdir(), 'church-remove-'));
  primary = join(sandbox, 'repo');
  feature = join(sandbox, 'repo.feature-a');
  execFileSync('git', ['init', '-q', '-b', 'develop', primary]);
  // CI runners have no Git identity.
  git([
    '-c',
    'user.name=test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);
  git(['worktree', 'add', '-q', '-b', 'feature-a', feature]);
});

afterEach(() => {
  if (bundlesDirOverride !== undefined) {
    process.env.CHURCH_FAILURE_BUNDLES_DIR = bundlesDirOverride;
  }
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

  it('leaves a failure bundle in the shared Git directory when it keeps the databases', async () => {
    generateLocalEnv({ cwd: feature });
    const bundlesDir = join(primary, '.git', 'church-failure-bundles');
    const outcome = await removeWorktreeDatabases({
      cwd: feature,
      serverUrl: UNREACHABLE_SERVER_URL,
    });

    reportRemoval({
      cwd: feature,
      outcome,
      startedAt: '2026-09-29T12:00:00.000Z' as Instant,
    });
    rmSync(feature, { recursive: true, force: true });

    expect(bundlesIn({ dir: bundlesDir })).toHaveLength(1);
    const path = join(bundlesDir, bundlesIn({ dir: bundlesDir })[0] ?? '');
    expect(
      JSON.parse(readFileSync(join(path, 'bundle.json'), 'utf8')),
    ).toMatchObject({
      command: 'worktree:remove',
      step: 'databases',
      exitStatus: 0,
      worktree: 'feature_a',
    });
    expect(readFileSync(join(path, 'output.log'), 'utf8')).toContain(
      'PostgreSQL is unavailable',
    );
  });

  it('leaves no bundle when the databases were dropped or never existed', () => {
    const bundlesDir = join(primary, '.git', 'church-failure-bundles');

    reportRemoval({
      cwd: feature,
      outcome: { kind: 'no-identity' },
      startedAt: '2026-09-29T12:00:00.000Z' as Instant,
    });
    reportRemoval({
      cwd: feature,
      outcome: {
        kind: 'dropped',
        databases: [{ database: 'church_feature_a_dev', existed: true }],
      },
      startedAt: '2026-09-29T12:00:00.000Z' as Instant,
    });

    expect(bundlesIn({ dir: bundlesDir })).toEqual([]);
  });
});
