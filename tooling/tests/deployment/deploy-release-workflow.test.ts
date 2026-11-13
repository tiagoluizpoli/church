import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { ROOT } from '../env/ci-workflow';

/**
 * #882: the wiring deploy:release and the staging rollout rely on — which
 * event deploys, that routing gates every downstream job, and how staging
 * deployments serialize and record evidence.
 */

interface Step {
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
}

interface Job {
  needs?: string[];
  if?: string;
  permissions?: Record<string, string>;
  concurrency?: { group: string; 'cancel-in-progress': boolean };
  environment?: { name: string };
  steps: Step[];
}

const workflow = Bun.YAML.parse(
  readFileSync(resolve(ROOT, '.github/workflows/deploy-release.yml'), 'utf8'),
) as { on: Record<string, { types: string[] }>; jobs: Record<string, Job> };

const job = (name: string): Job => {
  const found = workflow.jobs[name];
  if (!found) throw new Error(`deploy-release.yml has no ${name} job`);
  return found;
};

const route = (output: string) => `$${'{{'} needs.route.outputs.${output} }}`;

describe('deploy-release workflow', () => {
  it('starts only on a published release', () => {
    expect(workflow.on).toEqual({ release: { types: ['published'] } });
  });

  it('routes the release before anything is built or deployed', () => {
    expect(
      job('route')
        .steps.map((s) => s.run ?? '')
        .join('\n'),
    ).toContain('bun run deploy:release');
    expect(job('staging-images').if).toBe(
      "needs.route.outputs.environment == 'staging'",
    );
    expect(job('staging').needs).toEqual(['route', 'staging-images']);
  });

  it('builds candidate images from the routed revision', () => {
    const steps = job('staging-images').steps;

    expect(steps[0]?.with?.ref).toBe(route('revision'));
    expect(
      steps
        .filter((s) => s.with?.['build-args'])
        .map((s) => s.with?.['build-args']),
    ).toEqual([
      `APP_REVISION=${route('revision')}`,
      `APP_REVISION=${route('revision')}`,
    ]);
  });

  it('serializes staging deployments in their own environment', () => {
    const staging = job('staging');

    expect(staging.environment?.name).toBe('staging');
    expect(staging.concurrency).toEqual({
      group: 'deploy-staging',
      'cancel-in-progress': false,
    });
    expect(staging.permissions).toEqual({ contents: 'write' });
  });

  it('rolls out the routed candidate and records its evidence', () => {
    const rollout = job('staging').steps.find((s) =>
      s.run?.includes('deploy:rollout'),
    );

    expect(rollout?.run).toContain('--environment=staging');
    expect(rollout?.env).toMatchObject({
      REVISION: route('revision'),
      CANDIDATE: route('tag'),
      CONTENT: route('content'),
    });
    expect(rollout?.run).toContain('--candidate="$CANDIDATE"');
    expect(rollout?.run).toContain('--content="$CONTENT"');
    expect(rollout?.run).not.toMatch(/seed|provision/);
  });
});
