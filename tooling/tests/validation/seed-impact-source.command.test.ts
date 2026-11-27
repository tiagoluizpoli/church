import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * The real CLI at its dry-run seam against a temporary Git history. `gh` is a
 * stub on PATH, so no test depends on the network or a real pull request.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const SCRIPT_PATH = join(REPO_ROOT, 'tooling/validation/affected.ts');
const PERSISTENCE_DIR = 'apps/server/src/infrastructure/repositories';

let repo: string;
let bin: string;

const git = (...args: string[]) => {
  const { exitCode, stderr, stdout } = Bun.spawnSync(['git', ...args], {
    cwd: repo,
  });
  if (exitCode !== 0) throw new Error(stderr.toString());
  return stdout.toString().trim();
};

const commit = ({ file, message }: { file: string; message: string }) => {
  const path = join(repo, PERSISTENCE_DIR, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, 'export const x = 1;\n');
  git('add', '-A');
  git('commit', '-q', '-m', message);
  return git('rev-parse', '--short', 'HEAD');
};

/** What `gh pr view` answers; without this call the branch has no PR. */
const stubGh = ({ script }: { script: string }) => {
  const path = join(bin, 'gh');
  writeFileSync(path, `#!/bin/sh\n${script}\n`);
  chmodSync(path, 0o755);
};

const dryRun = ({ args = [] }: { args?: string[] } = {}) => {
  const result = Bun.spawnSync(['bun', SCRIPT_PATH, '--dry-run', ...args], {
    cwd: repo,
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const stderr = result.stderr.toString();
  if (result.exitCode !== 0) throw new Error(stderr);
  const plan = JSON.parse(result.stdout.toString());
  return { decision: plan.seedImpact.decision as string, stderr };
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'seed-source-repo-'));
  bin = mkdtempSync(join(tmpdir(), 'seed-source-bin-'));
  stubGh({ script: 'echo "no pull requests found" >&2; exit 1' });
  git('init', '-q', '-b', 'develop');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  writeFileSync(join(repo, 'README.md'), 'x\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'chore: baseline');
  git('checkout', '-q', '-b', 'feature/lower');
});

afterEach(() => {
  rmSync(repo, { force: true, recursive: true });
  rmSync(bin, { force: true, recursive: true });
});

describe('seed impact acknowledgement without a pull request', () => {
  it('accepts the trailer of the branch’s own commit', () => {
    commit({
      file: 'drizzle-a.ts',
      message: 'feat: a\n\nSeed-Impact: none - read only',
    });

    const { decision, stderr } = dryRun();

    expect(decision).toBe('acknowledged');
    expect(stderr).toContain('Seed impact: acknowledged');
    expect(stderr).toContain('  acknowledged: read only');
  });

  it('is undecided when the trailer sits below the configured validate base', () => {
    commit({
      file: 'drizzle-a.ts',
      message: 'feat: a\n\nSeed-Impact: none - lower',
    });
    git('checkout', '-q', '-b', 'feature/upper');
    git('config', 'branch.feature/upper.validateBase', 'feature/lower');
    commit({ file: 'drizzle-b.ts', message: 'feat: b' });

    const { decision, stderr } = dryRun();

    expect(decision).toBe('undecided');
    expect(stderr).toContain('Seed impact: decision required');
    expect(stderr).not.toContain('acknowledged:');
  });

  it('accepts --no-seed-impact for uncommitted work', () => {
    commit({ file: 'drizzle-a.ts', message: 'feat: a' });

    const { decision, stderr } = dryRun({
      args: ['--no-seed-impact', 'scratch'],
    });

    expect(decision).toBe('acknowledged');
    expect(stderr).toContain('  acknowledged: scratch');
  });
});

describe('seed impact acknowledgement source', () => {
  /** feature/upper, stacked on feature/lower, with an open PR onto it. */
  const stackOnLower = () => {
    const lowerSha = commit({
      file: 'drizzle-a.ts',
      message: 'feat: a\n\nSeed-Impact: none - lower only',
    });
    git('checkout', '-q', '-b', 'feature/upper');
    stubGh({
      script: `echo '{"baseRefName":"feature/lower","state":"OPEN"}'`,
    });
    return { lowerSha };
  };

  it('names the commit behind an acknowledgement it accepts', () => {
    const sha = commit({
      file: 'drizzle-a.ts',
      message: 'feat: a\n\nSeed-Impact: none - read only',
    });

    const { stderr } = dryRun();

    expect(stderr).toContain(`  acknowledged: read only (commit ${sha})`);
  });

  it('accepts the branch’s own trailer on a stacked branch', () => {
    const { lowerSha } = stackOnLower();
    const sha = commit({
      file: 'drizzle-b.ts',
      message: 'feat: b\n\nSeed-Impact: none - upper too',
    });

    const { decision, stderr } = dryRun();

    expect(decision).toBe('acknowledged');
    expect(stderr).toContain(`  acknowledged: upper too (commit ${sha})`);
    expect(stderr).not.toContain(lowerSha);
  });

  it('refuses a trailer borrowed from the branch below the open PR', () => {
    const { lowerSha } = stackOnLower();
    commit({ file: 'drizzle-b.ts', message: 'feat: b' });

    const { decision, stderr } = dryRun();

    expect(decision).toBe('undecided');
    expect(stderr).toContain(
      `  refused: lower only (commit ${lowerSha}) is not one of this branch's own commits (above feature/lower).`,
    );
    expect(stderr).toContain('Add the trailer on this branch.');
  });

  it('prefers the remote-tracking ref of the PR base', () => {
    const { lowerSha } = stackOnLower();
    git('update-ref', 'refs/remotes/origin/feature/lower', 'HEAD');
    git('branch', '-f', 'feature/lower', 'develop');
    commit({ file: 'drizzle-b.ts', message: 'feat: b' });

    const { stderr } = dryRun();

    expect(stderr).toContain(
      `(commit ${lowerSha}) is not one of this branch's own commits (above origin/feature/lower).`,
    );
  });

  it('measures own commits from the validate base once the PR is closed', () => {
    const { lowerSha } = stackOnLower();
    stubGh({
      script: `echo '{"baseRefName":"feature/lower","state":"MERGED"}'`,
    });
    commit({ file: 'drizzle-b.ts', message: 'feat: b' });

    const { decision, stderr } = dryRun();

    expect(decision).toBe('acknowledged');
    expect(stderr).toContain(`  acknowledged: lower only (commit ${lowerSha})`);
  });

  it('fails when the PR base is not available locally', () => {
    commit({
      file: 'drizzle-a.ts',
      message: 'feat: a\n\nSeed-Impact: none - read only',
    });
    stubGh({ script: `echo '{"baseRefName":"spec/gone","state":"OPEN"}'` });

    expect(() => dryRun()).toThrow('git fetch origin spec/gone');
  });
});
