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
 * local base-ref resolution (merge base with the branch's configured
 * `validateBase`, else `develop`, not its tip),
 * uncommitted-state inclusion, and journey-mapping selection all work
 * against actual `git` plumbing rather than a mocked diff.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
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
  // --dry-run keeps stdout as pure JSON (CI parses it with Bun) and sends the
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

  it('diffs a ticket branch against its configured integration branch, not develop', () => {
    git(['checkout', '--quiet', '-b', 'spec/9-integration', 'develop']);
    writeRepoFile('apps/web/src/earlier-ticket.ts');
    commitAll('feat: earlier ticket');
    git(['checkout', '--quiet', 'feature/x']);
    git(['config', 'branch.feature/x.validateBase', 'spec/9-integration']);
    git(['merge', '--quiet', '--no-edit', 'spec/9-integration']);
    writeRepoFile('apps/web/src/this-ticket.ts');
    commitAll('feat: this ticket');

    const { plan, stderr } = runAffected();

    expect(stderr).toContain('Base ref: spec/9-integration');
    expect(plan.lintPaths).toEqual(['apps/web/src/this-ticket.ts']);
  });

  it('keeps an explicit --base ahead of the configured integration branch', () => {
    git(['branch', 'spec/9-integration']);
    git(['config', 'branch.feature/x.validateBase', 'spec/9-integration']);

    const { stderr } = runAffected({ args: ['--base', 'develop'] });

    expect(stderr).toContain('Base ref: develop');
  });

  it('fails instead of falling back to develop when the configured base is missing', () => {
    git(['config', 'branch.feature/x.validateBase', 'spec/9-deleted']);

    const result = Bun.spawnSync(['bun', SCRIPT_PATH, '--dry-run'], {
      cwd: repoDir,
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain(
      '"spec/9-deleted", which does not resolve',
    );
  });

  it('keeps stdout as pure JSON so CI can parse it with jq, moving the explanation to stderr', () => {
    writeRepoFile('apps/web/src/shared/utils/active-church-switch.ts');
    commitAll('feat: active church switch');

    const result = Bun.spawnSync(['bun', SCRIPT_PATH, '--dry-run'], {
      cwd: repoDir,
      stderr: 'pipe',
      stdout: 'pipe',
    });

    // Mirrors ci.yml's "Determine affected plan": redirect stdout to a file,
    // then parse it with Bun.
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

describe('Journey-Impact trailer on the branch’s own commits', () => {
  const MAPPED = 'apps/web/src/shared/utils/active-church-switch.ts';
  const SWITCHING = ['tests/identity/active-church-switching.spec.ts'];

  const commitChange = (message: string) => {
    writeRepoFile(MAPPED);
    commitAll(message);
  };

  it('is accepted from a commit above the base', () => {
    commitChange('refactor: move it\n\nJourney-Impact: none - pure rename');

    const { plan, stderr } = runAffected();

    expect(plan.e2eSpecPaths).toEqual([]);
    expect(stderr).toContain('acknowledged: pure rename');
  });

  it('is refused without a reason, even with another trailer below it', () => {
    commitChange(
      'refactor: move it\n\nJourney-Impact: none -\nSeed-Impact: none - n/a',
    );

    expect(runAffected().plan.e2eSpecPaths).toEqual(SWITCHING);
  });

  it.each([
    'Journey-Impact: none -',
    'Journey-Impact: none',
  ])('says why "%s" is refused', (trailer) => {
    commitChange(`refactor: move it\n\n${trailer}`);

    const { stderr } = runAffected();

    expect(stderr).toMatch(
      /Journey impact: trailer refused, journeys run\n {2}refused: no reason given \(commit [0-9a-f]+\); write "Journey-Impact: none - <reason>"\./,
    );
  });

  it('is not borrowed from the configured validate base', () => {
    git(['checkout', '--quiet', '-b', 'spec/9-integration', 'develop']);
    writeRepoFile('apps/web/src/earlier.ts');
    commitAll('refactor: earlier\n\nJourney-Impact: none - lower branch');
    git(['checkout', '--quiet', '-b', 'feature/stacked']);
    git([
      'config',
      'branch.feature/stacked.validateBase',
      'spec/9-integration',
    ]);
    commitChange('feat: change behaviour');

    expect(runAffected().plan.e2eSpecPaths).toEqual(SWITCHING);
  });
});
