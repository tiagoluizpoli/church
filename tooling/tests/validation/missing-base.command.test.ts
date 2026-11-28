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
 * Every guard that diffs against a base commit, run as its real CLI against a
 * temporary Git history whose base commit is missing (#1233): an unknown
 * ref, or a base that shares no history with HEAD, as in a shallow clone.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const AFFECTED = join(REPO_ROOT, 'tooling/validation/affected.ts');
const CONSTITUTION = join(
  REPO_ROOT,
  'tooling/validation/constitution-version-guard.ts',
);
const CONSTITUTION_PATH = '.specify/memory/constitution.md';
const UNKNOWN_SHA = '0123456789abcdef0123456789abcdef01234567';

let repo: string;
let bin: string;

const git = (...args: string[]) => {
  const { exitCode, stderr, stdout } = Bun.spawnSync(['git', ...args], {
    cwd: repo,
  });
  if (exitCode !== 0) throw new Error(stderr.toString());
  return stdout.toString().trim();
};

const commitFile = ({
  content = 'export const x = 1;\n',
  message,
  path,
}: {
  content?: string;
  message: string;
  path: string;
}) => {
  const fullPath = join(repo, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  git('add', '-A');
  git('commit', '-q', '-m', message);
};

const run = ({ args, cwd = repo }: { args: string[]; cwd?: string }) => {
  const result = Bun.spawnSync(['bun', ...args], {
    cwd,
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
};

/** A branch tip with no history in common with HEAD, like a shallow base. */
const createUnrelatedBranch = ({ name }: { name: string }) => {
  const current = git('branch', '--show-current');
  git('checkout', '-q', '--orphan', name);
  commitFile({ message: 'chore: unrelated', path: 'unrelated.txt' });
  git('checkout', '-q', current);
};

const stubGh = ({ script }: { script: string }) => {
  const path = join(bin, 'gh');
  writeFileSync(path, `#!/bin/sh\n${script}\n`);
  chmodSync(path, 0o755);
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'missing-base-test-'));
  bin = join(repo, '.bin');
  mkdirSync(bin);
  writeFileSync(join(repo, '.gitignore'), '.bin/\n');
  stubGh({ script: 'exit 1' });
  git('init', '-q', '-b', 'develop');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  commitFile({
    content: '**Version**: 1.0.0\n\nBody.\n',
    message: 'chore: baseline',
    path: CONSTITUTION_PATH,
  });
  git('checkout', '-q', '-b', 'feature/x');
});

afterEach(() => {
  rmSync(repo, { force: true, recursive: true });
});

describe('constitution-version-guard.ts with a missing base', () => {
  it('fails when no base ref resolves', () => {
    git('branch', '-m', 'develop', 'main');

    const result = run({ args: [CONSTITUTION] });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No base ref found');
  });

  it('fails when --base names a ref that does not exist', () => {
    const result = run({ args: [CONSTITUTION, '--base', 'spec/9-gone'] });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('base ref "spec/9-gone" does not exist');
  });

  it('passes when --base names a commit missing from the clone', () => {
    const result = run({ args: [CONSTITUTION, '--base', UNKNOWN_SHA] });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('falls back to develop when the configured validate base is missing', () => {
    git('config', 'branch.feature/x.validateBase', 'spec/9-gone');

    const result = run({ args: [CONSTITUTION] });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });
});

describe('affected.ts with a missing base', () => {
  it('plans the working tree only when no base ref resolves', () => {
    commitFile({ message: 'feat: a', path: 'apps/web/src/App.tsx' });
    git('branch', '-m', 'develop', 'main');

    const result = run({ args: [AFFECTED, '--dry-run'] });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Base ref: (none — working tree only)');
    expect(JSON.parse(result.stdout).workspaceNames).toEqual([]);
  });

  it('fails when --base names a commit missing from the clone', () => {
    const result = run({
      args: [AFFECTED, '--dry-run', '--base', UNKNOWN_SHA],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `Invalid symmetric difference expression ${UNKNOWN_SHA}...HEAD`,
    );
  });

  it('fails when the base shares no history with HEAD', () => {
    createUnrelatedBranch({ name: 'spec/9-unrelated' });

    const result = run({
      args: [AFFECTED, '--dry-run', '--base', 'spec/9-unrelated'],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('spec/9-unrelated...HEAD: no merge base');
  });

  it('fails in a shallow clone whose base commit was not fetched', () => {
    commitFile({ message: 'feat: a', path: 'apps/web/src/App.tsx' });
    git('checkout', '-q', 'develop');
    commitFile({ message: 'chore: develop moves', path: 'develop.txt' });
    git('checkout', '-q', 'feature/x');
    const clone = join(repo, '.bin', 'shallow');
    git(
      'clone',
      '-q',
      '--depth',
      '1',
      '--no-local',
      '-b',
      'feature/x',
      repo,
      clone,
    );
    Bun.spawnSync(
      [
        'git',
        'fetch',
        '-q',
        '--depth',
        '1',
        'origin',
        'develop:refs/remotes/origin/develop',
      ],
      { cwd: clone },
    );

    const result = run({
      args: [AFFECTED, '--dry-run', '--base', 'origin/develop'],
      cwd: clone,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('origin/develop...HEAD: no merge base');
  });
});

describe('seed acknowledgements with a missing PR base', () => {
  it('accepts a trailer when the open PR base shares no history with HEAD', () => {
    createUnrelatedBranch({ name: 'feature/lower' });
    commitFile({
      message: 'feat: a\n\nSeed-Impact: none - test',
      path: 'apps/server/src/infrastructure/repositories/drizzle-a.ts',
    });
    stubGh({
      script: `echo '{"baseRefName":"feature/lower","state":"OPEN"}'`,
    });

    const result = run({ args: [AFFECTED, '--dry-run'] });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).seedImpact.decision).toBe('acknowledged');
  });
});
