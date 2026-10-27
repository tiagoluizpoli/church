import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';
import {
  ROOT,
  type WorkflowJob,
  type WorkflowStep,
  workflow,
} from './ci-workflow';

interface CompositeAction {
  runs: { steps: WorkflowStep[] };
}

const SETUP_ACTION = './.github/actions/setup-church-ci';
const SHARED_SETUP_LIMIT_MINUTES = 2;
const PLAN_OR_DATABASE_LIMIT_MINUTES = 1;
// One bound for the whole composite action (its steps cannot carry their own
// timeout); 5 minutes leaves the 10-minute daily jobs room for tests (#594).
const SHARED_SETUP_ACTION_LIMIT_MINUTES = 5;
const COMPOSITE_STEP_KEYS = new Set([
  'name',
  'id',
  'if',
  'run',
  'shell',
  'uses',
  'with',
  'env',
  'working-directory',
  'continue-on-error',
]);
const TEST_JOBS = [
  'develop-fast',
  'develop-browser',
  'release-gate',
  'fast-gate',
  'e2e',
];

const setupAction = Bun.YAML.parse(
  readFileSync(
    resolve(ROOT, '.github/actions/setup-church-ci/action.yml'),
    'utf8',
  ),
) as CompositeAction;

interface StepInput {
  job: WorkflowJob;
  id: string;
}

function stepWithId({ job, id }: StepInput): WorkflowStep | undefined {
  return job.steps.find((step) => step.id === id);
}

const SETUP_LABELS: Record<string, string> = {
  setup: 'shared setup',
  plan: 'affected planning',
  migrate: 'database migration',
  'integration-database': 'integration database',
  toolchain: 'toolchain',
  'dependency-cache': 'dependency cache',
  dependencies: 'dependency installation',
  'failure-bundles': 'failure-bundle setup',
};

interface RunInput {
  run: string;
}

/** The step ids a report step reads outcomes of, in the order it lists them. */
function referencedSteps({ run }: RunInput): string[] {
  return [...run.matchAll(/steps\.([a-z-]+)\.outcome/g)].map(
    (match) => match[1] ?? '',
  );
}

interface FailingAtInput {
  setupSteps: string[];
  failed: string;
}

/** GitHub's outcomes for a run that failed at one step: those before it
 * succeeded and those after it never started. */
function outcomesFailingAt({ setupSteps, failed }: FailingAtInput) {
  const failedIndex = setupSteps.indexOf(failed);
  return Object.fromEntries(
    setupSteps.map((id, index) => [
      id,
      index < failedIndex
        ? 'success'
        : index === failedIndex
          ? 'failure'
          : 'skipped',
    ]),
  );
}

interface SimulateInput extends RunInput {
  outcomes: Record<string, string>;
}

function simulate({ run, outcomes }: SimulateInput) {
  const command = run.replace(
    /\$\{\{ steps\.([a-z-]+)\.outcome \}\}/g,
    (_, id: string) => outcomes[id] ?? '',
  );
  const result = Bun.spawnSync(['bash', '-c', command], {
    cwd: ROOT,
    env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}

describe('CI setup phase bounds and reporting', () => {
  for (const name of TEST_JOBS) {
    const job = workflow.jobs[name] as WorkflowJob;

    describe(name, () => {
      it('bounds checkout and shared setup without changing the job ceiling', () => {
        expect(stepWithId({ job, id: 'checkout' })?.['timeout-minutes']).toBe(
          SHARED_SETUP_LIMIT_MINUTES,
        );
        expect(stepWithId({ job, id: 'setup' })?.uses).toBe(SETUP_ACTION);
        expect(stepWithId({ job, id: 'setup' })?.['timeout-minutes']).toBe(
          SHARED_SETUP_ACTION_LIMIT_MINUTES,
        );
        expect(job['timeout-minutes']).toBe(
          name === 'release-gate' || name === 'e2e' ? 20 : 10,
        );
      });

      it('reports through the shared script and keeps the failure nonzero', () => {
        const report = stepWithId({ job, id: 'report-failure-phase' });

        expect(report).toMatchObject({ if: 'failure() || cancelled()' });
        expect(report?.run).toStartWith(
          'bash tooling/ci/report-failure-phase.sh',
        );
        expect(report?.run).not.toContain('phase=');
      });

      it('reports a controlled failure of each setup step as setup, with no test step started', () => {
        const run = stepWithId({ job, id: 'report-failure-phase' })?.run ?? '';
        const setupSteps = referencedSteps({ run });

        expect(setupSteps).toContain('setup');
        for (const failed of setupSteps) {
          const result = simulate({
            run,
            outcomes: outcomesFailingAt({ setupSteps, failed }),
          });

          expect(result.exitCode).toBe(1);
          expect(result.stdout).toContain(
            `setup/infrastructure — ${SETUP_LABELS[failed]}`,
          );
          expect(result.stdout).not.toContain('test-command');
        }
      });

      it('reports a failed test command when every setup step succeeded', () => {
        const run = stepWithId({ job, id: 'report-failure-phase' })?.run ?? '';
        const outcomes = Object.fromEntries(
          referencedSteps({ run }).map((id) => [id, 'success']),
        );

        const result = simulate({ run, outcomes });

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain('CI failure phase: test-command');
      });
    });
  }

  it('uses only GitHub-supported composite step keys and reports the failed setup phase', () => {
    for (const step of setupAction.runs.steps) {
      const unsupportedKeys = Object.keys(step).filter(
        (key) => !COMPOSITE_STEP_KEYS.has(key),
      );

      expect(unsupportedKeys).toEqual([]);
    }

    const report = setupAction.runs.steps.find(
      (step) => step.id === 'report-setup-failure',
    );
    expect(report).toMatchObject({ if: 'failure() || cancelled()' });
    expect(report?.run).toContain('report-failure-phase.sh --setup-only');
  });

  it('reports a controlled failure of each shared setup step as setup', () => {
    const run =
      setupAction.runs.steps.find((step) => step.id === 'report-setup-failure')
        ?.run ?? '';
    const setupSteps = referencedSteps({ run });

    expect(setupSteps).toEqual([
      'toolchain',
      'dependency-cache',
      'dependencies',
      'failure-bundles',
      'migrate',
    ]);
    for (const failed of setupSteps) {
      const result = simulate({
        run,
        outcomes: outcomesFailingAt({ setupSteps, failed }),
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(
        `setup/infrastructure — ${SETUP_LABELS[failed]}`,
      );
      expect(result.stdout).not.toContain('test-command');
    }
  });

  it('reports a failed test command when release database setup was skipped', () => {
    const release = workflow.jobs['release-gate'] as WorkflowJob;
    const run =
      stepWithId({ job: release, id: 'report-failure-phase' })?.run ?? '';

    const result = simulate({
      run,
      outcomes: { setup: 'success', 'integration-database': 'skipped' },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('test-command');
    expect(result.stdout).not.toContain('integration database');
  });

  it('bounds planning and database migrations before browser tests', () => {
    const browser = workflow.jobs['develop-browser'] as WorkflowJob;
    const release = workflow.jobs['release-gate'] as WorkflowJob;

    expect(stepWithId({ job: browser, id: 'plan' })?.['timeout-minutes']).toBe(
      PLAN_OR_DATABASE_LIMIT_MINUTES,
    );
    expect(
      stepWithId({ job: browser, id: 'migrate' })?.['timeout-minutes'],
    ).toBe(PLAN_OR_DATABASE_LIMIT_MINUTES);
    expect(
      stepWithId({ job: release, id: 'integration-database' })?.[
        'timeout-minutes'
      ],
    ).toBe(PLAN_OR_DATABASE_LIMIT_MINUTES);
  });

  it('keeps no-journey skips and the required aggregate failure/cancellation gate', () => {
    const browser = workflow.jobs['develop-browser'] as WorkflowJob;
    const aggregate = workflow.jobs['develop-gate'] as WorkflowJob;
    const migrations = stepWithId({ job: browser, id: 'migrate' });
    const journeys = browser.steps.find((step) =>
      step.name?.startsWith('Browser journeys'),
    );
    const requireWorkers = aggregate.steps.find((step) =>
      step.name?.startsWith('Require both workers'),
    );

    expect(migrations?.if).toBe("steps.plan.outputs.needs_e2e == 'true'");
    expect(journeys?.if).toBe("steps.plan.outputs.needs_e2e == 'true'");
    expect(aggregate.name).toBe('Develop Gate (Fast + Affected)');
    expect(aggregate.if).toContain('always()');
    expect(aggregate.needs).toEqual(['develop-fast', 'develop-browser']);
    expect(requireWorkers?.run).toContain('needs.develop-fast.result');
    expect(requireWorkers?.run).toContain('needs.develop-browser.result');
    expect(requireWorkers?.run).toContain('!= "success"');
  });
});
