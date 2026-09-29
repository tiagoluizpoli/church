import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { activeWorktreeIdentities } from '../../worktree/local-env';
import { selectStaleDatabases } from '../../worktree/prune-databases';

/**
 * Which databases `db:prune` selects, and which worktrees it counts as
 * active; listing and dropping run against a real server in
 * packages/db/tests/drop-databases.test.ts.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const PRUNE_SCRIPT = resolve(REPO_ROOT, 'tooling/worktree/prune-databases.ts');
const LOCAL_ENV_SCRIPT = resolve(REPO_ROOT, 'tooling/worktree/local-env.ts');

describe('selectStaleDatabases', () => {
  const activeIdentities = new Set(['develop', 'feature_a']);

  it('selects the databases of worktrees that are no longer active', () => {
    expect(
      selectStaleDatabases({
        databases: [
          'church_feature_a_dev',
          'church_feature_a_int',
          'church_feature_a_e2e',
          'church_gone_dev',
          'church_gone_int',
          'church_gone_e2e',
        ],
        activeIdentities,
      }),
    ).toEqual(['church_gone_dev', 'church_gone_int', 'church_gone_e2e']);
  });

  it("keeps every database an active worktree owns, such as its tests' scratch databases", () => {
    expect(
      selectStaleDatabases({
        databases: [
          'church_feature_a_provision_test_dev',
          'church_feature_a_drop_test_int',
          'church_gone_drop_test_int',
        ],
        activeIdentities,
      }),
    ).toEqual(['church_gone_drop_test_int']);
  });

  it("keeps the primary checkout's databases", () => {
    expect(
      selectStaleDatabases({
        databases: ['church', 'church_develop_int', 'church_develop_e2e'],
        activeIdentities,
      }),
    ).toEqual([]);
  });

  it('never selects church or databases outside the worktree namespace', () => {
    expect(
      selectStaleDatabases({
        databases: [
          'church',
          'church_test',
          'church_gone',
          'church_gone_prod',
          'postgres',
          'template1',
          'other_gone_dev',
        ],
        activeIdentities: new Set(),
      }),
    ).toEqual([]);
  });
});

describe('activeWorktreeIdentities', () => {
  let sandbox: string;
  let primary: string;

  function git(args: string[]): void {
    execFileSync('git', args, { cwd: primary, stdio: 'ignore' });
  }

  interface WorktreeInput {
    branch: string;
  }

  function addWorktree(input: WorktreeInput): string {
    const root = join(sandbox, `repo.${input.branch}`);
    git(['worktree', 'add', '-q', '-b', input.branch, root]);
    return root;
  }

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'church-prune-'));
    primary = join(sandbox, 'repo');
    execFileSync('git', ['init', '-q', '-b', 'develop', primary]);
    git(['commit', '-q', '--allow-empty', '-m', 'init']);
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('counts the primary and every linked worktree, bootstrapped or not', () => {
    const bootstrapped = addWorktree({ branch: 'feature-a' });
    execFileSync('bun', [LOCAL_ENV_SCRIPT], {
      cwd: bootstrapped,
      stdio: 'ignore',
    });
    addWorktree({ branch: 'feature-b' });

    expect(activeWorktreeIdentities({ cwd: primary })).toEqual(
      new Set(['develop', 'feature_a', 'feature_b']),
    );
  });

  it('keeps the persisted identity of a worktree whose branch was renamed', () => {
    const root = addWorktree({ branch: 'feature-a' });
    execFileSync('bun', [LOCAL_ENV_SCRIPT], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['branch', '-m', 'feature-renamed'], { cwd: root });

    expect(activeWorktreeIdentities({ cwd: root })).toEqual(
      new Set(['develop', 'feature_a', 'feature_renamed']),
    );
  });

  it('stops counting a worktree whose directory was deleted', () => {
    const root = addWorktree({ branch: 'feature-a' });
    execFileSync('bun', [LOCAL_ENV_SCRIPT], { cwd: root, stdio: 'ignore' });
    rmSync(root, { recursive: true, force: true });

    expect(activeWorktreeIdentities({ cwd: primary })).toEqual(
      new Set(['develop']),
    );
  });

  it('can leave out the worktree it runs in', () => {
    const root = addWorktree({ branch: 'feature-a' });
    execFileSync('bun', [LOCAL_ENV_SCRIPT], { cwd: root, stdio: 'ignore' });
    addWorktree({ branch: 'feature-b' });

    expect(
      activeWorktreeIdentities({ cwd: root, excludeCurrent: true }),
    ).toEqual(new Set(['develop', 'feature_b']));
  });

  it('ignores a hand-written .env.local', () => {
    const root = addWorktree({ branch: 'feature-a' });
    writeFileSync(join(root, '.env.local'), 'CHURCH_WORKTREE=forged\n');

    expect(activeWorktreeIdentities({ cwd: primary })).toEqual(
      new Set(['develop', 'feature_a']),
    );
  });
});

describe('db:prune', () => {
  it('refuses an unknown argument before touching PostgreSQL', () => {
    const result = spawnSync('bun', [PRUNE_SCRIPT, '--aply'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--aply');
  });
});
