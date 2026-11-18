import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Runs the real guard in a disposable clean checkout whose `api:generate` is a
 * stand-in, so regeneration never rewrites this working tree (#859).
 */

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const GENERATED_FILE = 'apps/server/auto-generated-api.yaml';

let checkoutDir: string;

function git(args: string[]) {
  Bun.spawnSync(['git', ...args], { cwd: checkoutDir });
}

function runGuard({ generate }: { generate: string }) {
  writeFileSync(
    join(checkoutDir, 'package.json'),
    JSON.stringify({ scripts: { 'api:generate': generate } }),
  );
  const result = Bun.spawnSync(
    ['bun', 'tooling/validation/api-generated-guard.ts'],
    { cwd: checkoutDir, stderr: 'pipe', stdout: 'pipe' },
  );
  return { exitCode: result.exitCode, stderr: result.stderr.toString() };
}

beforeEach(() => {
  checkoutDir = mkdtempSync(join(tmpdir(), 'api-generated-guard-'));
  mkdirSync(join(checkoutDir, 'tooling/validation'), { recursive: true });
  cpSync(
    join(REPO_ROOT, 'tooling/validation/api-generated-guard.ts'),
    join(checkoutDir, 'tooling/validation/api-generated-guard.ts'),
  );
  mkdirSync(join(checkoutDir, 'apps/server'), { recursive: true });
  writeFileSync(join(checkoutDir, GENERATED_FILE), 'openapi: 3.0.0\n');
  git(['init', '--quiet']);
  git(['add', '-A']);
  git([
    '-c',
    'user.email=t@e.st',
    '-c',
    'user.name=T',
    'commit',
    '-qm',
    'base',
  ]);
});

afterEach(() => {
  rmSync(checkoutDir, { force: true, recursive: true });
});

describe('api-generated-guard command', () => {
  it('passes when regeneration leaves the checkout clean', () => {
    // package.json is untracked but outside the guarded paths.
    expect(runGuard({ generate: 'true' }).exitCode).toBe(0);
  });

  it('fails and names the file when regeneration drifts', () => {
    const { exitCode, stderr } = runGuard({
      generate: `echo drift >> ${GENERATED_FILE}`,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain(GENERATED_FILE);
  });

  it('fails when regeneration itself fails', () => {
    expect(runGuard({ generate: 'false' }).exitCode).not.toBe(0);
  });
});
