import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { ROOT } from '../env/ci-workflow';

/**
 * #887: the wiring deploy:rollback relies on — a manual run per environment
 * that builds nothing, holds that environment's deployment lock, and the
 * deployment jobs that record the verified rollouts it returns to.
 */

interface Step {
  uses?: string;
  run?: string;
  env?: Record<string, string>;
}

interface Job {
  permissions?: Record<string, string>;
  concurrency?: { group: string; 'cancel-in-progress': boolean };
  environment?: { name: string };
  steps: Step[];
}

interface Workflow {
  on: Record<string, { inputs?: Record<string, { options?: string[] }> }>;
  jobs: Record<string, Job>;
}

const read = (name: string) =>
  Bun.YAML.parse(
    readFileSync(resolve(ROOT, '.github/workflows', name), 'utf8'),
  ) as Workflow;

const rollback = read('rollback.yml');
const development = read('deploy-development.yml');
const release = read('deploy-release.yml');
const job = rollback.jobs.rollback as Job;
const INPUT = (name: string) => `$${'{{'} inputs.${name} }}`;

// The lock a deployment job of the environment holds.
const DEPLOY_JOBS: Array<[string, Job | undefined]> = [
  ['development', development.jobs.deploy],
  ['staging', release.jobs.staging],
  ['production', release.jobs.production],
];

describe('rollback workflow', () => {
  it('runs only when an operator starts it for one of the three environments', () => {
    expect(Object.keys(rollback.on)).toEqual(['workflow_dispatch']);
    expect(rollback.on.workflow_dispatch?.inputs?.environment?.options).toEqual(
      ['development', 'staging', 'production'],
    );
    expect(job.environment?.name).toBe(INPUT('environment'));
  });

  it.each(
    DEPLOY_JOBS,
  )('holds the %s deployment lock without cancelling a running operation', (environment, deployJob) => {
    const group = job.concurrency?.group.replace(
      INPUT('environment'),
      environment,
    );

    expect(group).toBe(deployJob?.concurrency?.group);
    expect(job.concurrency?.['cancel-in-progress']).toBe(false);
  });

  it('redeploys the selected revision without building an image', () => {
    const command = job.steps.find((step) =>
      step.run?.includes('deploy:rollback'),
    );

    expect(job.steps.some((step) => step.uses?.includes('build-push'))).toBe(
      false,
    );
    expect(command?.env?.REVISION).toBe(INPUT('revision'));
    expect(command?.env?.ENVIRONMENT).toBe(INPUT('environment'));
    expect(job.permissions?.deployments).toBe('write');
  });

  it.each(
    DEPLOY_JOBS,
  )('lets every %s deployment record its verified rollout', (_, deployJob) => {
    const rollout = deployJob?.steps.find((step) =>
      /deploy:(rollout|promote)/.test(step.run ?? ''),
    );

    expect(deployJob?.permissions?.deployments).toBe('write');
    expect(rollout?.env?.GITHUB_TOKEN).toBeDefined();
  });
});
