import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ROOT, type WorkflowJob, workflow } from '../env/ci-workflow';

const SCRIPT = resolve(import.meta.dir, '../../ci/record-test-output.sh');
const RECORDING_SHELL = 'bash tooling/ci/record-test-output.sh {0}';
const TEST_JOBS = [
  'develop-fast',
  'develop-browser',
  'release-gate',
  'release-integration',
  'fast-gate',
  'e2e',
];
// A step that runs a test runner: the test scripts and the affected gate.
const RUNS_TESTS = /\b(?:test:[\w-]+|validate:affected)\b/;

interface CompositeAction {
  runs: { steps: { id?: string; run?: string }[] };
}

let sandbox: string;
let log: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'church-test-output-'));
  log = join(sandbox, 'test-output.log');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

interface StepScriptInput {
  script: string;
}

/** Runs a step script the way GitHub runs a step with a custom shell. */
function runStep({ script }: StepScriptInput) {
  const scriptPath = join(sandbox, 'step.sh');
  writeFileSync(scriptPath, script);
  const result = Bun.spawnSync(['bash', SCRIPT, scriptPath], {
    env: { ...process.env, CHURCH_TEST_OUTPUT_LOG: log },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

describe('record-test-output.sh', () => {
  it('passes the output through and appends it to the test output log', () => {
    writeFileSync(log, 'earlier step\n');

    const { exitCode, stdout } = runStep({
      script: 'echo "::error file=a.ts,line=1::boom"\necho warn >&2\n',
    });

    expect(exitCode).toBe(0);
    expect(stdout).toBe('::error file=a.ts,line=1::boom\nwarn\n');
    expect(readFileSync(log, 'utf8')).toBe(
      'earlier step\n::error file=a.ts,line=1::boom\nwarn\n',
    );
  });

  it("keeps the step's exit status and stops at its first failing command, like `shell: bash`", () => {
    const { exitCode, stdout } = runStep({
      script: 'echo first\nfalse | cat\necho never\n',
    });

    expect(exitCode).toBe(1);
    expect(stdout).toBe('first\n');
  });

  it('runs the step without a copy when no log is configured', () => {
    const scriptPath = join(sandbox, 'step.sh');
    writeFileSync(scriptPath, 'echo hi\nexit 3\n');
    const { CHURCH_TEST_OUTPUT_LOG: _unset, ...env } = process.env;
    const result = Bun.spawnSync(['bash', SCRIPT, scriptPath], {
      env,
      stdout: 'pipe',
    });

    expect(result.exitCode).toBe(3);
    expect(result.stdout.toString()).toBe('hi\n');
  });
});

describe('CI test output recording', () => {
  it('records the output of every step that runs tests', () => {
    for (const name of TEST_JOBS) {
      const job = workflow.jobs[name] as WorkflowJob;
      const testSteps = job.steps.filter((step) =>
        RUNS_TESTS.test(step.run ?? ''),
      );

      expect(testSteps.length).toBeGreaterThan(0);
      for (const step of testSteps) {
        expect({ job: name, step: step.name, shell: step.shell }).toEqual({
          job: name,
          step: step.name,
          shell: RECORDING_SHELL,
        });
      }
    }
  });

  it('gives every job one test output log in runner-temporary storage', () => {
    const setupAction = Bun.YAML.parse(
      readFileSync(
        resolve(ROOT, '.github/actions/setup-church-ci/action.yml'),
        'utf8',
      ),
    ) as CompositeAction;
    const exports = setupAction.runs.steps.map((step) => step.run ?? '');

    expect(exports).toContain(
      [
        'echo "CHURCH_FAILURE_BUNDLES_DIR=$RUNNER_TEMP/church-failure-bundles" >> "$GITHUB_ENV"',
        'echo "CHURCH_TEST_OUTPUT_LOG=$RUNNER_TEMP/church-test-output.log" >> "$GITHUB_ENV"',
        '',
      ].join('\n'),
    );
  });
});
