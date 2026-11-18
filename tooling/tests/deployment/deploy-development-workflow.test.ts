import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { workflow as ci, ROOT } from '../env/ci-workflow';

/**
 * #881: the wiring the deploy command relies on — which push deploys, which
 * check it waits for, and how deployments to the environment serialize.
 */

interface DeployJob {
  name?: string;
  needs?: string[];
  if?: string;
  concurrency?: { group: string; 'cancel-in-progress': boolean };
  environment?: { name: string; url: string };
  steps: Array<{ name?: string; run?: string; env?: Record<string, string> }>;
}

interface DeployWorkflow {
  on: { push: { branches: string[] } } & Record<string, unknown>;
  jobs: Record<string, DeployJob>;
}

const deploy = Bun.YAML.parse(
  readFileSync(
    resolve(ROOT, '.github/workflows/deploy-development.yml'),
    'utf8',
  ),
) as DeployWorkflow;

const ciTriggers = (ci as unknown as { on: { push: { branches: string[] } } })
  .on;

// A GitHub Actions expression over the job's `needs`.
const EXPRESSION = (path: string) => `$${'{{'} needs.${path} }}`;

function runs(job: DeployJob): string {
  return job.steps.map((step) => step.run ?? '').join('\n');
}

describe('deploy-development workflow', () => {
  it('deploys only pushes to develop', () => {
    expect(Object.keys(deploy.on)).toEqual(['push']);
    expect(deploy.on.push.branches).toEqual(['develop']);
  });

  it('waits for a check that CI actually runs on a develop push', () => {
    const waited = runs(deploy.jobs.checks).match(/--check="([^"]+)"/)?.[1];
    const fastGate = ci.jobs['fast-gate'];

    expect(waited).toBe(fastGate?.name);
    expect(fastGate?.if).toBe("github.event_name == 'push'");
    expect(ciTriggers.push.branches).toContain('develop');
  });

  it('deploys after the checks select the revision and the images exist', () => {
    const { deploy: job } = deploy.jobs;

    expect(job.needs).toEqual(['checks', 'images']);
    expect(job.if).toBe("needs.checks.outputs.deploy == 'true'");
    expect(job.environment?.name).toBe('development');
  });

  it('serializes development deployments without cancelling a running one', () => {
    expect(deploy.jobs.deploy.concurrency).toEqual({
      group: 'deploy-development',
      'cancel-in-progress': false,
    });
  });

  it('rolls out the built digests with the development Mailpit overlay', () => {
    const job = deploy.jobs.deploy;
    const commands = runs(job);
    const rollout = job.steps.find((step) =>
      step.run?.includes('deploy:rollout'),
    );

    expect(commands).toContain('-f deployment/compose.mailpit.yml');
    expect(rollout?.run).toContain('--environment=development');
    expect(rollout?.env?.SERVER_IMAGE).toBe(
      EXPRESSION('images.outputs.server'),
    );
    expect(rollout?.env?.WEB_IMAGE).toBe(EXPRESSION('images.outputs.web'));
    expect(commands).not.toMatch(/seed|provision/);
  });
});
