import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isBuiltin } from 'node:module';
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
let bundlesDir: string;

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
  const env: Record<string, string | undefined> = {
    ...process.env,
    PATH: `${sandbox}:${process.env.PATH}`,
    FAIL_ON: input.failOn ?? '',
    CHURCH_FAILURE_BUNDLES_DIR: bundlesDir,
  };
  delete env.CHURCH_FAILURE_BUNDLE_OWNER;

  const result = spawnSync(process.execPath, [BOOTSTRAP_SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env,
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

function bundles(): string[] {
  return existsSync(bundlesDir) ? readdirSync(bundlesDir) : [];
}

function recorded(): string[] {
  return existsSync(log)
    ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean)
    : [];
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'church-bootstrap-'));
  log = join(sandbox, 'commands.log');
  bundlesDir = join(sandbox, 'bundles');
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
    expect(bundles()).toEqual([]);
  });

  it('stops at the first failing step, names it, and points to the rerun', () => {
    const result = run({ failOn: 'bun run env:local' });

    expect(result.status).not.toBe(0);
    expect(recorded()).not.toContain('bun run db:bootstrap');
    expect(result.output).toContain('failed at "configuration"');
    expect(result.output).toContain('bun run worktree:bootstrap');
  });

  it('leaves one failure bundle naming the failed step and prints its path', () => {
    const result = run({ failOn: 'bun run env:local' });

    expect(bundles()).toHaveLength(1);
    const path = join(bundlesDir, bundles()[0] ?? '');
    expect(result.output).toContain(path);
    expect(
      JSON.parse(readFileSync(join(path, 'bundle.json'), 'utf8')),
    ).toMatchObject({
      command: 'worktree:bootstrap',
      step: 'configuration',
      commandLine: 'bun run env:local',
      exitStatus: 3,
    });
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

  it('loads before dependencies are installed, since its first step installs them', async () => {
    const build = await Bun.build({
      entrypoints: [BOOTSTRAP_SCRIPT],
      target: 'bun',
      packages: 'external',
    });
    const code = (await build.outputs[0]?.text()) ?? '';
    const packageImports = [
      ...code.matchAll(/(?:from|import|require\()\s*["']([^"']+)["']/g),
    ]
      .map((match) => match[1] ?? '')
      .filter(
        (specifier) =>
          !isBuiltin(specifier) && !/^(bun$|\.|\/)/.test(specifier),
      );

    expect(build.success).toBe(true);
    expect(packageImports).toEqual([]);
  });
});
