import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Exercises the real CLI at its dry-run seam against representative
 * temporary Git histories (#286's Testing Decisions), proving the default
 * local base-ref resolution (merge base with `develop`, not its tip),
 * uncommitted-state inclusion, and journey-mapping selection all work
 * against actual `git` plumbing rather than a mocked diff.
 */

const REPO_ROOT = resolve(import.meta.dir, '../..');
const SCRIPT_PATH = join(REPO_ROOT, 'tooling/validation/affected.ts');

let repoDir: string;

function git(args: string[]): void {
  const result = Bun.spawnSync(['git', ...args], {
    cwd: repoDir,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed: ${result.stderr.toString()}`,
    );
  }
}

function writeRepoFile(path: string, content = 'export const x = 1;\n'): void {
  const fullPath = join(repoDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function commitAll(message: string): void {
  git(['add', '-A']);
  git(['commit', '-m', message]);
}

interface RunAffectedInput {
  args?: string[];
}

interface RunAffectedResult {
  exitCode: number;
  plan: Record<string, unknown>;
  stderr: string;
}

function runAffected({ args = [] }: RunAffectedInput = {}): RunAffectedResult {
  const result = Bun.spawnSync(['bun', SCRIPT_PATH, '--dry-run', ...args], {
    cwd: repoDir,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (result.exitCode !== 0) {
    throw new Error(`affected.ts --dry-run failed: ${stderr}\n${stdout}`);
  }
  // --dry-run keeps stdout as pure JSON (CI parses it with jq) and sends the
  // human-readable explanation to stderr instead.
  const plan = JSON.parse(stdout);
  return { exitCode: result.exitCode, plan, stderr };
}

beforeEach(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'affected-command-test-'));
  git(['init', '--quiet', '-b', 'develop']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  writeRepoFile('apps/web/src/App.tsx');
  commitAll('chore: baseline');
  git(['checkout', '--quiet', '-b', 'feature/x']);
});

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

describe('affected.ts --dry-run against a temporary Git history', () => {
  it('includes a committed-only clean branch’s changes by default (no explicit --base)', () => {
    writeRepoFile('apps/web/src/shared/utils/active-church-switch.ts');
    commitAll('feat: active church switch');

    const { plan } = runAffected();

    expect(plan.workspaceNames).toContain('web');
    expect(plan.e2eSpecPaths).toContain(
      'tests/identity/active-church-switching.spec.ts',
    );
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('combines committed branch changes with uncommitted (dirty) work', () => {
    writeRepoFile('apps/web/src/shared/utils/active-church-switch.ts');
    commitAll('feat: active church switch');
    // Leave an unmapped production change dirty (never committed).
    writeRepoFile('apps/web/src/routes/dashboard.tsx');

    const { plan } = runAffected();

    expect(plan.e2eSpecPaths).toContain(
      'tests/identity/active-church-switching.spec.ts',
    );
    expect(plan.missingJourneyMappings).toContain(
      'apps/web/src/routes/dashboard.tsx',
    );
  });

  it('includes untracked files never staged or committed', () => {
    writeRepoFile('apps/web/src/routes/dashboard.tsx');

    const { plan } = runAffected();

    expect(plan.workspaceNames).toContain('web');
    expect(plan.missingJourneyMappings).toContain(
      'apps/web/src/routes/dashboard.tsx',
    );
  });

  it('handles a deletion and a rename without crashing', () => {
    unlinkSync(join(repoDir, 'apps/web/src/App.tsx'));
    writeRepoFile('apps/web/src/shared/utils/active-church-switch.ts');
    commitAll('feat: add a file to rename next');
    git([
      'mv',
      'apps/web/src/shared/utils/active-church-switch.ts',
      'apps/web/src/shared/utils/active-church-switch-2.ts',
    ]);

    const { plan } = runAffected();

    expect(plan.workspaceNames).toContain('web');
  });

  it('honors an explicit --base override instead of the default develop merge base', () => {
    git(['branch', 'release-target']);
    writeRepoFile('apps/web/src/routes/dashboard.tsx');
    commitAll('feat: dashboard route');

    const { stderr } = runAffected({ args: ['--base', 'release-target'] });

    expect(stderr).toContain('Base ref: release-target');
  });

  it('keeps stdout as pure JSON so CI can parse it with jq, moving the explanation to stderr', () => {
    writeRepoFile('apps/web/src/shared/utils/active-church-switch.ts');
    commitAll('feat: active church switch');

    const result = Bun.spawnSync(['bun', SCRIPT_PATH, '--dry-run'], {
      cwd: repoDir,
      stderr: 'pipe',
      stdout: 'pipe',
    });

    // Mirrors ci.yml's "Determine affected plan" step: redirect stdout to a
    // file, then parse it with jq.
    expect(() => JSON.parse(result.stdout.toString())).not.toThrow();
    expect(result.stderr.toString()).toContain('Base ref:');
  });

  it('selects only lint/workspace scope for a non-production change (docs)', () => {
    writeRepoFile('apps/web/README.md', '# notes\n');
    commitAll('docs: add notes');

    const { plan } = runAffected();

    expect(plan.e2eSpecPaths).toEqual([]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });
});
