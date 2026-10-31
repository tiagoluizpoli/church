import { describe, expect, it } from 'bun:test';
import {
  buildValidationSteps,
  classifyChanges,
} from '../../validation/affected';
import type { LaneStep } from '../../validation/run-lanes';

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

function unitStepsOf(steps: { checkLane: LaneStep[] }): LaneStep[] {
  return steps.checkLane.filter(({ label }) => label === 'test:unit');
}

function relatedStep(workspaceName: string, paths: string[]): LaneStep {
  return {
    args: [
      'turbo',
      'test:unit:related',
      '--concurrency=2',
      '--filter',
      workspaceName,
      '--only',
      '--',
      ...paths,
    ],
    command: 'bunx',
    label: 'test:unit',
  };
}

function wholeSuiteStep(workspaceNames: string[]): LaneStep {
  return {
    args: [
      'turbo',
      'test:unit',
      '--concurrency=2',
      ...workspaceNames.flatMap((workspaceName) => ['--filter', workspaceName]),
      '--only',
      '--',
    ],
    command: 'bunx',
    label: 'test:unit',
  };
}

describe('no-docker unit tests picked by import graph', () => {
  it('runs the tests related to a plain source change, with exactly its changed files', () => {
    const steps = noDockerStepsFor({
      changedPaths: [
        'apps/server/src/domain/services/resend-throttle.ts',
        'apps/server/src/domain/services/shift-splitter.ts',
      ],
    });

    expect(unitStepsOf(steps)).toEqual([
      relatedStep('server', [
        'src/domain/services/resend-throttle.ts',
        'src/domain/services/shift-splitter.ts',
      ]),
    ]);
  });

  it('runs the related tests of a shared package and of its dependents', () => {
    const steps = noDockerStepsFor({
      changedPaths: ['packages/core/src/entity.ts'],
    });

    expect(unitStepsOf(steps)).toEqual([
      relatedStep('@church/core', ['src/entity.ts']),
      relatedStep('server', ['../../packages/core/src/entity.ts']),
    ]);
  });

  it('selects a changed unit test file', () => {
    const steps = noDockerStepsFor({
      changedPaths: ['apps/web/tests/lib/auth-error-message.unit.test.ts'],
    });

    expect(unitStepsOf(steps)).toEqual([
      relatedStep('web', ['tests/lib/auth-error-message.unit.test.ts']),
    ]);
  });

  it.each([
    ['vitest config', 'apps/server/vitest.config.ts'],
    ['test setup file', 'apps/server/tests/setup/integration-worker-count.ts'],
    ['env file', 'apps/server/.env.schema'],
    ['workspace package.json', 'apps/server/package.json'],
    ['tsconfig', 'apps/server/tsconfig.json'],
    ['test fixture', 'apps/server/tests/fixtures/sample.ts'],
  ])('runs the whole unit suite when a %s changes', (_trigger, changedPath) => {
    const steps = noDockerStepsFor({
      changedPaths: [
        'apps/server/src/domain/services/resend-throttle.ts',
        changedPath,
      ],
    });

    expect(unitStepsOf(steps)).toEqual([wholeSuiteStep(['server'])]);
  });

  it.each([
    ['root package.json', 'package.json'],
    ['lockfile', 'bun.lock'],
  ])('runs every whole unit suite when the %s changes', (_trigger, changedPath) => {
    const steps = noDockerStepsFor({ changedPaths: [changedPath] });

    expect(unitStepsOf(steps)).toEqual([
      wholeSuiteStep([
        '@church/auth',
        '@church/config',
        '@church/core',
        '@church/db',
        '@church/env',
        '@church/time',
        'server',
        'web',
      ]),
    ]);
  });

  it('runs the whole unit suite of a workspace that lost a file', () => {
    const steps = noDockerStepsFor({
      changedPaths: ['packages/core/src/gone.ts'],
      deletedPaths: ['packages/core/src/gone.ts'],
    });

    expect(unitStepsOf(steps)).toEqual([
      wholeSuiteStep(['@church/core', 'server']),
    ]);
  });
});
