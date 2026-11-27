import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// #1162: the job summary lists the failed tests that the recorded test
// output annotated, so `gh run view` and the run page show them without the
// log. The lines below are what each runner prints on GitHub Actions.
const WORKSPACE = '/home/runner/work/church/church';
const VITEST_ANNOTATION = `::error file=${WORKSPACE}/apps/web/tests/a.unit.test.ts,title=[unit] tests/a.unit.test.ts > a > fails,line=4,column=17::AssertionError: expected 2 to be 3 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 3%0A+ 2%0A%0A ❯ tests/a.unit.test.ts:4:17%0A%0A`;
const PLAYWRIGHT_ANNOTATION =
  '::error file=apps/web/tests/identity/sign-in.spec.ts,title=identity/sign-in.spec.ts:4:3 › signs in,line=5,col=19::  1) identity/sign-in.spec.ts:4:3 › signs in ───────%0A%0A    Error: expect(received).toBe(expected) // Object.is equality%0A%0A    Expected: 3%0A    Received: 2%0A%0A      3 | test(%0A      4 |   x,%0A    > 5 |     expect(1 + 1).toBe(3);%0A      6 |   });%0A';
const BUN_ANNOTATION =
  '::error file=tooling/tests/ci/x.test.ts,line=10,title=tooling/tests/ci/x.test.ts > outer > throws 50%25::Error: boom%0A      at tooling/tests/ci/x.test.ts:10:27';

interface RecordedOutputInput {
  args: string[];
  lines: string[];
}

function reportWithOutput({ args, lines }: RecordedOutputInput) {
  const log = join(sandbox, 'test-output.log');
  writeFileSync(log, `${lines.join('\n')}\n`);
  const result = Bun.spawnSync(['bash', SCRIPT, ...args], {
    env: {
      ...process.env,
      CHURCH_TEST_OUTPUT_LOG: log,
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_WORKSPACE: WORKSPACE,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}

describe('report-failure-phase.sh failed tests', () => {
  it('lists each annotated failed test with file:line and its first error lines', () => {
    const { exitCode, stdout } = reportWithOutput({
      args: ['success:shared setup'],
      lines: [
        '[lint] Checked 12 files.',
        VITEST_ANNOTATION,
        '::error::command (/repo/apps/web) bun run test:unit exited (1)',
        PLAYWRIGHT_ANNOTATION,
        '::notice title=🎭 Playwright Run Summary::  1 failed',
        BUN_ANNOTATION,
        VITEST_ANNOTATION,
      ],
    });

    const expected = [
      '### CI failure phase',
      'test-command',
      '### Failed tests',
      '',
      '- **[unit] tests/a.unit.test.ts > a > fails** at `apps/web/tests/a.unit.test.ts:4`',
      '  ```',
      '  AssertionError: expected 2 to be 3 // Object.is equality',
      '  - Expected',
      '  + Received',
      '  - 3',
      '  + 2',
      '   ❯ tests/a.unit.test.ts:4:17',
      '  ```',
      '- **identity/sign-in.spec.ts:4:3 › signs in** at `apps/web/tests/identity/sign-in.spec.ts:5`',
      '  ```',
      '  1) identity/sign-in.spec.ts:4:3 › signs in ───────',
      '    Error: expect(received).toBe(expected) // Object.is equality',
      '    Expected: 3',
      '    Received: 2',
      '      3 | test(',
      '      4 |   x,',
      '    > 5 |     expect(1 + 1).toBe(3);',
      '      6 |   });',
      '  ```',
      '- **tooling/tests/ci/x.test.ts > outer > throws 50%** at `tooling/tests/ci/x.test.ts:10`',
      '  ```',
      '  Error: boom',
      '        at tooling/tests/ci/x.test.ts:10:27',
      '  ```',
      '',
    ].join('\n');
    expect(exitCode).toBe(1);
    expect(readFileSync(summary, 'utf8')).toBe(expected);
    expect(stdout).toContain('### Failed tests');
  });

  it('keeps at most the first eight lines of an error', () => {
    reportWithOutput({
      args: ['success:shared setup'],
      lines: [
        '::error file=a.test.ts,line=1,title=a::1%0A2%0A3%0A4%0A5%0A6%0A7%0A8%0A9',
      ],
    });

    expect(readFileSync(summary, 'utf8')).toContain('  8\n  ```\n');
    expect(readFileSync(summary, 'utf8')).not.toContain('  9\n');
  });

  it('lists the first 30 failed tests and counts the rest', () => {
    const lines = Array.from(
      { length: 32 },
      (_, index) =>
        `::error file=t${index}.test.ts,line=1,title=t${index}::boom`,
    );
    reportWithOutput({ args: ['success:shared setup'], lines });

    const written = readFileSync(summary, 'utf8');
    expect(written).toContain('- **t29** at `t29.test.ts:1`');
    expect(written).not.toContain('**t30**');
    expect(written).toEndWith('  ```\n- …and 2 more in the job log\n');
  });

  it('fences an error that contains a code fence with a longer one', () => {
    reportWithOutput({
      args: ['success:shared setup'],
      lines: [
        '::error file=a.test.ts,line=1,title=a::expected%0A```%0Ax%0A```',
      ],
    });

    expect(readFileSync(summary, 'utf8')).toContain(
      '  ````\n  expected\n  ```\n  x\n  ```\n  ````\n',
    );
  });

  it('adds no failed-tests section when the output annotated no test', () => {
    reportWithOutput({
      args: ['success:shared setup'],
      lines: ['::error::command exited (1)', 'plain output'],
    });

    expect(readFileSync(summary, 'utf8')).toBe(
      '### CI failure phase\ntest-command\n',
    );
  });

  it('lists no failed tests when setup failed', () => {
    reportWithOutput({
      args: ['failure:shared setup'],
      lines: [VITEST_ANNOTATION],
    });

    expect(readFileSync(summary, 'utf8')).toBe(
      '### CI failure phase\nsetup/infrastructure — shared setup\n',
    );
  });

  it('reports the phase alone when no test output was recorded', () => {
    const result = Bun.spawnSync(['bash', SCRIPT, 'success:shared setup'], {
      env: {
        ...process.env,
        CHURCH_TEST_OUTPUT_LOG: join(sandbox, 'missing.log'),
        GITHUB_STEP_SUMMARY: summary,
      },
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(result.exitCode).toBe(1);
    expect(readFileSync(summary, 'utf8')).toBe(
      '### CI failure phase\ntest-command\n',
    );
  });
});
