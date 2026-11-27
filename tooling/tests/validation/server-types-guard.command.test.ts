import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const SCRIPT_PATH = join(REPO_ROOT, 'tooling/validation/server-types-guard.ts');
const CHURCH = 'apps/server/src/application/church/create-church.ts';
const SETTINGS = 'apps/server/src/application/settings/update-settings.ts';
const REPOSITORY =
  'apps/server/src/infrastructure/repositories/drizzle-church.repository.ts';
const CONTRACT =
  'apps/server/src/domain/contracts/application/create-church.ts';

const REPORT = [
  'apps/server/src/application/church: 2',
  `  ${CHURCH}:1: interface CreateInput`,
  `  ${CHURCH}:2: type CreateResult`,
  'apps/server/src/application/settings: 1',
  `  ${SETTINGS}:1: interface CreateInput`,
  'apps/server/src/infrastructure/repositories: 1',
  `  ${REPOSITORY}:1: interface CreateInput`,
  '4 type declarations in server implementation files (#1179: move them to contracts)',
];

let workDir: string;

function writeSource({ path, source }: { path: string; source: string }) {
  const fullPath = join(workDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, source);
}

function runGuard(args: string[]) {
  const result = Bun.spawnSync(['bun', SCRIPT_PATH, ...args], {
    cwd: workDir,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe('server types guard command', () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'server-types-guard-'));
    const single = 'export interface CreateInput { id: string }\n';
    writeSource({
      path: CHURCH,
      source: `${single}export type CreateResult = { id: string };\n`,
    });
    writeSource({ path: SETTINGS, source: single });
    writeSource({ path: REPOSITORY, source: single });
    writeSource({ path: CONTRACT, source: single });
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('report-only mode prints violations grouped by folder and exits zero', () => {
    const { exitCode, stdout, stderr } = runGuard([
      REPOSITORY,
      SETTINGS,
      CONTRACT,
      CHURCH,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trimEnd().split('\n')).toEqual(REPORT);
    expect(stderr).toBe('');
  });

  it('failing mode prints the same report to stderr and exits nonzero', () => {
    const { exitCode, stdout, stderr } = runGuard([
      '--fail',
      REPOSITORY,
      SETTINGS,
      CONTRACT,
      CHURCH,
    ]);

    expect(exitCode).toBe(1);
    expect(stderr.trimEnd().split('\n')).toEqual(REPORT);
    expect(stdout).toBe('');
  });

  it('failing mode exits zero and prints nothing when no file declares a type', () => {
    const { exitCode, stdout, stderr } = runGuard(['--fail', CONTRACT]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('');
    expect(stderr).toBe('');
  });
});
