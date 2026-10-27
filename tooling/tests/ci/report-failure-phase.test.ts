import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

const SCRIPT = resolve(import.meta.dir, '../../ci/report-failure-phase.sh');

let sandbox: string;
let summary: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'church-failure-phase-'));
  summary = join(sandbox, 'summary.md');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function report(args: string[]) {
  const result = Bun.spawnSync(['bash', SCRIPT, ...args], {
    env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}

describe('report-failure-phase.sh', () => {
  it('reads a failure outside the setup steps as the test command', () => {
    const { exitCode, stdout } = report([
      'success:shared setup',
      'skipped:database migration',
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain('::error::CI failure phase: test-command');
    expect(readFileSync(summary, 'utf8')).toBe(
      '### CI failure phase\ntest-command\n',
    );
  });

  it('names the failed setup step and never calls it a test failure', () => {
    const { exitCode, stdout } = report([
      'success:shared setup',
      'failure:database migration',
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain(
      '::error::CI failure phase: setup/infrastructure — database migration',
    );
    expect(stdout).not.toContain('test-command');
  });

  it('reports the first failed setup step', () => {
    const { stdout } = report([
      'failure:toolchain',
      'failure:dependency cache',
    ]);

    expect(stdout).toContain('setup/infrastructure — toolchain');
  });

  it('reports a cancelled step before a failed one', () => {
    const { exitCode, stdout } = report([
      'failure:shared setup',
      'cancelled:database migration',
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain('::error::CI failure phase: cancelled');
  });

  it('has no test command to fall back to when every step is setup', () => {
    const { exitCode, stdout } = report([
      '--setup-only',
      'success:toolchain',
      'skipped:database migration',
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain('setup/infrastructure — unidentified step');
    expect(stdout).not.toContain('test-command');
  });

  it('still fails when the job gives it no summary file', () => {
    const result = Bun.spawnSync(['bash', SCRIPT, 'failure:shared setup'], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(result.exitCode).toBe(1);
  });
});
