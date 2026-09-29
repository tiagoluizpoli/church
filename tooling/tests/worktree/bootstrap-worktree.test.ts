import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Drives the real `worktree:bootstrap` command with `bun` replaced on PATH
 * by a recorder, asserting the commands it runs, their order, and how it
 * reports a failed step.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const BOOTSTRAP_SCRIPT = resolve(
  REPO_ROOT,
  'tooling/worktree/bootstrap-worktree.ts',
);

let sandbox: string;
let log: string;

interface RunInput {
  failOn?: string;
}

interface RunResult {
  status: number | null;
  output: string;
}

/** A PATH command that records its command line and fails when that line
 * is exactly `$FAIL_ON`. */
function recorder(): string {
  return `#!/bin/sh
line="$(basename "$0") $*"
echo "$line" >> "${log}"
[ "$line" = "$FAIL_ON" ] && exit 3
exit 0
`;
}

function run(input: RunInput): RunResult {
  const result = spawnSync(process.execPath, [BOOTSTRAP_SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${sandbox}:${process.env.PATH}`,
      FAIL_ON: input.failOn ?? '',
    },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

function recorded(): string[] {
  return existsSync(log)
    ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean)
    : [];
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'church-bootstrap-'));
  log = join(sandbox, 'commands.log');
  writeFileSync(join(sandbox, 'bun'), recorder());
  chmodSync(join(sandbox, 'bun'), 0o755);
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('worktree:bootstrap', () => {
  it('installs, verifies the shared PostgreSQL, generates configuration, then provisions databases', () => {
    const result = run({});

    expect(result.status, result.output).toBe(0);
    expect(recorded()).toEqual([
      'bun install --frozen-lockfile',
      'bun run db:start',
      'bun run env:local',
      'bun run db:bootstrap',
    ]);
  });

  it('stops at the first failing step, names it, and points to the rerun', () => {
    const result = run({ failOn: 'bun run env:local' });

    expect(result.status).not.toBe(0);
    expect(recorded()).not.toContain('bun run db:bootstrap');
    expect(result.output).toContain('failed at "configuration"');
    expect(result.output).toContain('bun run worktree:bootstrap');
  });

  it('generates nothing when the shared PostgreSQL never becomes healthy', () => {
    const result = run({
      failOn: 'bun run db:start',
    });

    expect(result.status).not.toBe(0);
    expect(recorded()).toEqual([
      'bun install --frozen-lockfile',
      'bun run db:start',
    ]);
    expect(result.output).toContain('failed at "postgres"');
  });
});
