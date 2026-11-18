import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Drives the real `run-managed.ts` wrapper from a throwaway repository's
 * feature worktree, asserting the exit status, what it prints, and what it
 * leaves in the shared Git directory.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const RUN_MANAGED = resolve(REPO_ROOT, 'tooling/diagnostics/run-managed.ts');

let sandbox: string;
let primary: string;
let feature: string;
let bundlesDir: string;

function git(args: string[]): void {
  execFileSync('git', args, { cwd: primary, stdio: 'ignore' });
}

interface RunInput {
  name: string;
  command: string[];
  /** Options between the name and `--`, e.g. `--step`. */
  options?: string[];
  env?: Record<string, string>;
}

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(input: RunInput): RunResult {
  const env = { ...process.env };
  delete env.CHURCH_FAILURE_BUNDLES_DIR;
  delete env.CHURCH_FAILURE_BUNDLE_OWNER;

  const result = spawnSync(
    process.execPath,
    [RUN_MANAGED, input.name, ...(input.options ?? []), '--', ...input.command],
    { cwd: feature, encoding: 'utf8', env: { ...env, ...input.env } },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function bundles(): string[] {
  return existsSync(bundlesDir) ? readdirSync(bundlesDir) : [];
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'church-run-managed-'));
  primary = join(sandbox, 'repo');
  feature = join(sandbox, 'repo.feature-a');
  bundlesDir = join(primary, '.git', 'church-failure-bundles');
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
  rmSync(sandbox, { recursive: true, force: true });
});

describe('run-managed', () => {
  it('passes a successful command through and records nothing', () => {
    const result = run({
      name: 'env:local',
      command: ['sh', '-c', 'echo configured; echo note >&2'],
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('configured\n');
    expect(result.stderr).toBe('note\n');
    expect(bundles()).toEqual([]);
  });

  it('keeps the exit status of a failure, records a sanitized bundle in the shared Git directory, and prints its path', () => {
    const result = run({
      name: 'db:bootstrap',
      command: [
        'sh',
        '-c',
        'echo started; echo "cannot reach postgresql://postgres:pw-9f2c@127.0.0.1:5444/db?sslmode=disable" >&2; exit 7',
      ],
    });

    expect(result.status).toBe(7);
    expect(result.stdout).toBe('started\n');
    expect(result.stderr).toContain('pw-9f2c');
    expect(bundles()).toHaveLength(1);

    const path = join(bundlesDir, bundles()[0] ?? '');
    expect(result.stderr).toContain(`failure bundle: ${path}`);

    const metadata = JSON.parse(
      readFileSync(join(path, 'bundle.json'), 'utf8'),
    );
    expect(metadata).toMatchObject({
      command: 'db:bootstrap',
      step: null,
      exitStatus: 7,
      signal: null,
      worktreePath: feature,
      purpose: null,
    });
    expect(metadata.durationMs).toBeGreaterThanOrEqual(0);

    const output = readFileSync(join(path, 'output.log'), 'utf8');
    expect(output).toContain('started\n');
    expect(output).toContain('cannot reach postgresql://127.0.0.1:5444/db');
    expect(output).not.toContain('pw-9f2c');
    expect(output).not.toContain('sslmode');
  });

  it('records a command that cannot start', () => {
    const result = run({
      name: 'env:local',
      command: ['church-no-such-program'],
    });

    expect(result.status).not.toBe(0);
    expect(bundles()).toHaveLength(1);
  });

  it('records one bundle, for the outermost managed command, when managed commands nest', () => {
    const result = run({
      name: 'worktree:bootstrap',
      command: [
        process.execPath,
        RUN_MANAGED,
        'env:local',
        '--',
        'sh',
        '-c',
        'echo inner failure >&2; exit 4',
      ],
    });

    expect(result.status).toBe(4);
    expect(bundles()).toHaveLength(1);

    const path = join(bundlesDir, bundles()[0] ?? '');
    const metadata = JSON.parse(
      readFileSync(join(path, 'bundle.json'), 'utf8'),
    );
    expect(metadata.command).toBe('worktree:bootstrap');
    expect(readFileSync(join(path, 'output.log'), 'utf8')).toContain(
      'inner failure',
    );
  });

  it('records the step and execution purpose of a test command', () => {
    const result = run({
      name: 'test:integration',
      options: ['--step', '@church/server'],
      command: ['sh', '-c', 'echo "1 test failed" >&2; exit 1'],
      env: { CHURCH_EXEC_PURPOSE: 'integration' },
    });

    expect(result.status).toBe(1);
    expect(bundles()).toHaveLength(1);

    const path = join(bundlesDir, bundles()[0] ?? '');
    expect(
      JSON.parse(readFileSync(join(path, 'bundle.json'), 'utf8')),
    ).toMatchObject({
      command: 'test:integration',
      step: '@church/server',
      purpose: 'integration',
      exitStatus: 1,
      artifacts: [],
    });
    expect(readFileSync(join(path, 'output.log'), 'utf8')).toBe(
      '1 test failed\n',
    );
  });

  it('refuses to run without a name and a command', () => {
    const result = spawnSync(process.execPath, [RUN_MANAGED, 'env:local'], {
      cwd: feature,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Usage');
    expect(bundles()).toEqual([]);
  });
});
