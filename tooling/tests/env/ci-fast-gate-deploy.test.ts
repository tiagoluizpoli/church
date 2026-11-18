import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { ROOT, workflow } from './ci-workflow';

/**
 * #881: deploy-development.yml waits for the push run's "Fast Gate" result
 * before deploying develop. A Fast Gate that is skipped, filtered out or
 * renamed on a develop push leaves that wait with no verdict, so the deploy
 * times out instead of shipping. Keep the job unconditional on push.
 */

const FAST_GATE = workflow.jobs['fast-gate'];
const deployDevelopment = readFileSync(
  resolve(ROOT, '.github/workflows/deploy-development.yml'),
  'utf8',
);

describe('Fast Gate as the development deploy check', () => {
  it('runs CI on every develop push, with no path filter', () => {
    const push = workflow.on.push;

    expect(push?.branches).toContain('develop');
    expect(push?.paths).toBeUndefined();
    expect(push?.['paths-ignore']).toBeUndefined();
  });

  it('runs on every push, independent of other jobs', () => {
    expect(FAST_GATE?.if).toBe("github.event_name == 'push'");
    expect(FAST_GATE?.needs).toBeUndefined();
  });

  it('carries the name the deploy workflow waits for', () => {
    expect(FAST_GATE?.name).toBe('Fast Gate');
    expect(deployDevelopment).toContain(`--check="${FAST_GATE?.name}"`);
  });
});
