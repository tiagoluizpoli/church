import { describe, expect, it } from 'bun:test';
import {
  buildValidationSteps,
  classifyChanges,
} from '../../validation/affected';

interface StepsForInput {
  changedPaths: string[];
  deletedPaths?: string[];
}

function noDockerStepsFor({ changedPaths, deletedPaths }: StepsForInput) {
  const plan = classifyChanges({ changedPaths, deletedPaths });
  return buildValidationSteps({
    onlyE2e: false,
    plan,
    skipE2e: false,
    tier: 'no-docker',
  });
}

function labelsOf(steps: { label: string }[]): string[] {
  return steps.map(({ label }) => label);
}

describe('the no-docker tier', () => {
  it('plans no integration or browser-journey step for a server change', () => {
    const steps = noDockerStepsFor({
      changedPaths: ['apps/server/src/index.ts'],
    });

    expect(steps.integrationLane).toEqual([]);
    expect(steps.e2eSteps).toEqual([]);
    expect(labelsOf(steps.checkLane)).not.toContain('test:integration');
    expect(labelsOf(steps.checkLane)).not.toContain('test:e2e');
  });

  it('plans no full E2E suite when shared E2E infrastructure changes', () => {
    const steps = noDockerStepsFor({
      changedPaths: ['apps/web/playwright.config.ts'],
    });

    expect(steps.e2eSteps).toEqual([]);
  });

  it('keeps lint, the guards, typecheck and whole-workspace unit tests', () => {
    const steps = noDockerStepsFor({
      changedPaths: ['packages/core/package.json'],
    });

    expect(labelsOf(steps.checkLane)).toEqual([
      'lint',
      'test-placement',
      'i18n-parity',
      'named-parameters',
      'journey-map',
      'typecheck',
      'test:unit',
    ]);
    expect(steps.checkLane.at(-1)).toEqual({
      args: [
        'turbo',
        'test:unit',
        '--concurrency=2',
        '--filter',
        '@church/core',
        '--filter',
        'server',
        '--only',
        '--',
      ],
      command: 'bunx',
      label: 'test:unit',
    });
  });

  it('keeps a deleted file’s workspace in scope for unit tests', () => {
    const steps = noDockerStepsFor({
      changedPaths: ['packages/core/src/gone.ts'],
      deletedPaths: ['packages/core/src/gone.ts'],
    });

    expect(labelsOf(steps.checkLane)).toContain('test:unit');
  });

  it('plans no unit step for a docs-only change', () => {
    const steps = noDockerStepsFor({ changedPaths: ['docs/adr/0004.md'] });

    expect(labelsOf(steps.checkLane)).not.toContain('test:unit');
  });
});
