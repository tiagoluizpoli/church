import { describe, expect, it } from 'bun:test';
import {
  buildValidationSteps,
  classifyChanges,
  explainPlan,
} from '../../validation/affected';
import type { LaneStep } from '../../validation/run-lanes';

interface StepsForInput {
  changedPaths: string[];
  deletedPaths?: string[];
  tier: 'affected' | 'no-docker';
  wholeUnitSuites?: boolean;
}

function stepsFor({
  changedPaths,
  deletedPaths,
  tier,
  wholeUnitSuites,
}: StepsForInput) {
  const plan = classifyChanges({ changedPaths, deletedPaths });
  return buildValidationSteps({
    onlyE2e: false,
    plan,
    skipE2e: true,
    tier,
    wholeUnitSuites,
  });
}

function unitSteps(steps: { checkLane: LaneStep[] }): LaneStep[] {
  return steps.checkLane.filter(({ label }) => label === 'test:unit');
}

describe('validate:affected unit narrowing', () => {
  it('runs the related unit tests of a plain source change, with exactly its changed files', () => {
    const steps = stepsFor({
      changedPaths: ['apps/server/src/domain/services/shift-splitter.ts'],
      tier: 'affected',
    });

    expect(unitSteps(steps)[0]?.args).toEqual([
      'turbo',
      'test:unit:related',
      '--concurrency=2',
      '--filter',
      'server',
      '--only',
      '--',
      'src/domain/services/shift-splitter.ts',
    ]);
  });

  it.each([
    ['vitest config', 'apps/server/vitest.config.ts', {}],
    ['test setup', 'apps/server/tests/setup/integration-worker-count.ts', {}],
    ['env file', 'apps/server/.env.schema', {}],
    ['package.json', 'apps/server/package.json', {}],
    ['root package.json', 'package.json', {}],
    ['lockfile', 'bun.lock', {}],
    ['tsconfig', 'apps/server/tsconfig.json', {}],
    ['test fixture', 'apps/server/tests/fixtures/sample.ts', {}],
    ['deleted file', 'packages/core/src/gone.ts', { deleted: true }],
    ['file outside src/tests/seeds', 'apps/server/drizzle.config.ts', {}],
  ])('widens exactly as no-docker does when a %s changes', (_name, changedPath, options) => {
    const input = {
      changedPaths: [
        'apps/server/src/domain/services/shift-splitter.ts',
        changedPath,
      ],
      deletedPaths: 'deleted' in options ? [changedPath] : undefined,
    };

    expect(unitSteps(stepsFor({ ...input, tier: 'affected' }))).toEqual(
      unitSteps(stepsFor({ ...input, tier: 'no-docker' })),
    );
  });

  it('keeps whole-workspace unit steps when asked (CI Develop Gate)', () => {
    const steps = stepsFor({
      changedPaths: ['apps/server/src/domain/services/shift-splitter.ts'],
      tier: 'affected',
      wholeUnitSuites: true,
    });

    expect(unitSteps(steps)).toEqual([
      {
        args: [
          'turbo',
          'test:unit',
          '--concurrency=2',
          '--filter',
          'server',
          '--only',
          '--',
        ],
        command: 'bunx',
        label: 'test:unit',
      },
    ]);
  });

  it('leaves integration selection on whole affected workspaces', () => {
    const steps = stepsFor({
      changedPaths: ['apps/server/src/domain/services/shift-splitter.ts'],
      tier: 'affected',
    });

    expect(steps.integrationLane.map(({ args }) => args)).toEqual(
      stepsFor({
        changedPaths: ['apps/server/src/domain/services/shift-splitter.ts'],
        tier: 'affected',
        wholeUnitSuites: true,
      }).integrationLane.map(({ args }) => args),
    );
    expect(steps.integrationLane.length).toBeGreaterThan(0);
  });
});

describe('the run summary unit selection', () => {
  const plan = classifyChanges({
    changedPaths: [
      'apps/server/src/domain/services/shift-splitter.ts',
      'apps/web/vitest.config.ts',
    ],
  });

  it('states related or whole suite, with the reason, per workspace', () => {
    const explanation = explainPlan({ baseRef: undefined, plan });

    expect(explanation).toContain('Unit test selection:');
    expect(explanation).toContain('  - server: related tests');
    expect(explanation).toContain(
      '  - web: whole suite (untraceable change: apps/web/vitest.config.ts)',
    );
  });
});
