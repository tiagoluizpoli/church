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

function outcomeExpression(step: string): string {
  return `${'$'}{{ steps.${step}.outcome }}`;
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

      it('reports setup failures separately and leaves test commands nonzero', () => {
        const report = stepWithId({ job, id: 'report-failure-phase' });

        expect(report).toMatchObject({ if: 'failure() || cancelled()' });
        expect(report?.run).toContain('setup/infrastructure');
        expect(report?.run).toContain('test-command');
        expect(report?.run).toContain('phase="cancelled"');
        expect(report?.run).toContain('exit 1');
        expect(report?.run).toContain('steps.checkout.outcome');
        expect(report?.run).toContain('steps.setup.outcome');
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
    expect(report?.run).toContain('setup/infrastructure');
    expect(report?.run).toContain('exit 1');
  });

  it('reports a failed test command when release database setup was skipped', () => {
    const release = workflow.jobs['release-gate'] as WorkflowJob;
    const report = stepWithId({ job: release, id: 'report-failure-phase' });
    const command = (report?.run ?? '')
      .replaceAll(outcomeExpression('checkout'), 'success')
      .replaceAll(outcomeExpression('setup'), 'success')
      .replaceAll(outcomeExpression('integration-database'), 'skipped');
    const result = Bun.spawnSync(['bash', '-c', command], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: '/dev/null' },
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain('test-command');
    expect(result.stdout.toString()).not.toContain('integration database');
  });

  it('reports container startup when the job failed before checkout ran', () => {
    for (const name of TEST_JOBS) {
      const job = workflow.jobs[name] as WorkflowJob;
      const report = stepWithId({ job, id: 'report-failure-phase' });
      const command = (report?.run ?? '').replace(
        /\$\{\{ steps\.[a-z-]+\.outcome \}\}/g,
        '',
      );
      const result = Bun.spawnSync(['bash', '-c', command], {
        env: { ...process.env, GITHUB_STEP_SUMMARY: '/dev/null' },
        stderr: 'pipe',
        stdout: 'pipe',
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toContain(
        'setup/infrastructure — container or service startup',
      );
    }
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
