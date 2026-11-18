import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Runs the real version command (#882) against a scratch package.json: it
 * prepares the next release candidate or stable version and nothing else.
 */

const SCRIPT = resolve(import.meta.dir, '../../deployment/version.ts');

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'version-command-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function writeVersion(version: string | undefined): void {
  const manifest = { name: 'church', private: true, version, workspaces: [] };
  writeFileSync(
    join(workDir, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function manifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf8'));
}

// Without GITHUB_TOKEN or network access: a bump cannot publish or deploy.
function runVersion(args: string[]) {
  const result = Bun.spawnSync(['bun', '--no-env-file', SCRIPT, ...args], {
    cwd: workDir,
    env: { PATH: process.env.PATH },
  });
  return {
    exitCode: result.exitCode,
    output: `${result.stdout}${result.stderr}`,
  };
}

describe('version rc', () => {
  it.each([
    ['patch', '1.2.3', '1.2.4-rc.1'],
    ['minor', '1.2.3', '1.3.0-rc.1'],
    ['major', '1.2.3', '2.0.0-rc.1'],
  ])('starts a %s candidate from %s', (level, from, to) => {
    writeVersion(from);

    const result = runVersion(['rc', level]);

    expect(result.exitCode).toBe(0);
    expect(manifest().version).toBe(to);
    expect(result.output).toContain(`v${to}`);
  });

  it('increments the current candidate', () => {
    writeVersion('1.3.0-rc.9');

    const result = runVersion(['rc']);

    expect(result.exitCode).toBe(0);
    expect(manifest().version).toBe('1.3.0-rc.10');
  });

  it('starts from 0.0.0 when no version was recorded yet', () => {
    writeVersion(undefined);

    runVersion(['rc', 'minor']);

    expect(manifest().version).toBe('0.1.0-rc.1');
  });

  it('keeps the rest of the manifest as written', () => {
    writeVersion('1.2.3');

    runVersion(['rc', 'patch']);

    expect(Object.keys(manifest())).toEqual([
      'name',
      'private',
      'version',
      'workspaces',
    ]);
  });

  it('needs a level to start a candidate from a stable version', () => {
    writeVersion('1.2.3');

    const result = runVersion(['rc']);

    expect(result.exitCode).toBe(2);
    expect(manifest().version).toBe('1.2.3');
  });

  it('refuses a level while a candidate is open', () => {
    writeVersion('1.3.0-rc.2');

    const result = runVersion(['rc', 'major']);

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('stable');
    expect(manifest().version).toBe('1.3.0-rc.2');
  });
});

describe('version stable', () => {
  it('finalizes the candidate under test', () => {
    writeVersion('1.3.0-rc.4');

    const result = runVersion(['stable']);

    expect(result.exitCode).toBe(0);
    expect(manifest().version).toBe('1.3.0');
    expect(result.output).toContain('v1.3.0');
  });

  it('refuses a version that was never a candidate', () => {
    writeVersion('1.3.0');

    const result = runVersion(['stable']);

    expect(result.exitCode).toBe(2);
    expect(manifest().version).toBe('1.3.0');
  });

  it('refuses a malformed recorded version', () => {
    writeVersion('1.3');

    const result = runVersion(['stable']);

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('"1.3"');
  });
});
