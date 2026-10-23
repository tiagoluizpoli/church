import { describe, expect, it } from 'bun:test';
import { buildValidationSteps } from '../../validation/affected';
import { makePlan } from './plan';

// Existing file, so the deleted-file filter keeps it.
const LINT_PATH = 'package.json';

const TEST_PLACEMENT_STEP = {
  args: ['run', 'validate:test-placement'],
  command: 'bun',
  label: 'test-placement',
};

const I18N_PARITY_STEP = {
  args: ['run', 'validate:i18n-parity'],
  command: 'bun',
  label: 'i18n-parity',
};

const NAMED_PARAMETERS_STEP = {
  args: ['run', 'validate:named-parameters'],
  command: 'bun',
  label: 'named-parameters',
};

const JOURNEY_MAP_STEP = {
  args: ['run', 'validate:journey-map'],
  command: 'bun',
  label: 'journey-map',
};

describe('buildValidationSteps', () => {
  it('skips the test-placement guard for an E2E-only run', () => {
    const { checkLane } = buildValidationSteps({
      onlyE2e: true,
      plan: makePlan({}),
      skipE2e: false,
    });

    expect(checkLane).not.toContainEqual(TEST_PLACEMENT_STEP);
  });

  it('plans only the guards for an empty plan', () => {
    const steps = buildValidationSteps({
      onlyE2e: false,
      plan: makePlan({}),
      skipE2e: false,
    });

    expect(steps.checkLane).toEqual([
      TEST_PLACEMENT_STEP,
      I18N_PARITY_STEP,
      NAMED_PARAMETERS_STEP,
      JOURNEY_MAP_STEP,
    ]);
    expect(steps.checkedLabels).toContain('test-placement');
    expect(steps.checkedLabels).toContain('i18n-parity');
    expect(steps.checkedLabels).toContain('named-parameters');
    expect(steps.checkedLabels).toContain('journey-map');
    expect(steps.integrationLane).toEqual([]);
    expect(steps.e2eSteps).toEqual([]);
  });

  it('runs the journey-map guard for a Playwright-test-only change', () => {
    const { checkLane } = buildValidationSteps({
      onlyE2e: false,
      plan: makePlan({
        e2eSpecPaths: ['tests/identity/new-journey.spec.ts'],
        lintPaths: ['apps/web/tests/identity/new-journey.spec.ts'],
      }),
      skipE2e: false,
    });

    expect(checkLane).toContainEqual(JOURNEY_MAP_STEP);
  });

  it('plans lint and typecheck in the first lane', () => {
    const { checkLane } = buildValidationSteps({
      onlyE2e: false,
      plan: makePlan({
        lintPaths: [LINT_PATH, 'does/not/exist.ts'],
        workspaceNames: ['web', '@church/core'],
      }),
      skipE2e: false,
    });

    expect(checkLane).toEqual([
      {
        args: ['run', 'lint:files', '--', LINT_PATH],
        command: 'bun',
        label: 'lint',
      },
      TEST_PLACEMENT_STEP,
      I18N_PARITY_STEP,
      NAMED_PARAMETERS_STEP,
      JOURNEY_MAP_STEP,
      {
        args: [
          'turbo',
          'typecheck',
          '--concurrency=2',
          '--filter',
          'web',
          '--filter',
          '@church/core',
        ],
        command: 'bunx',
        label: 'typecheck',
      },
    ]);
  });

  it('splits unit tests into remaining workspaces plus one step per targeted workspace', () => {
    const { checkLane, integrationLane } = buildValidationSteps({
      onlyE2e: false,
      plan: makePlan({
        testLayers: ['test:unit'],
        testTargets: [
          {
            testLayer: 'test:unit',
            testPath: 'src/a.test.ts',
            workspaceName: 'web',
          },
          {
            testLayer: 'test:unit',
            testPath: 'src/b.test.ts',
            workspaceName: 'web',
          },
        ],
        workspaceNames: ['web', 'server'],
      }),
      skipE2e: false,
    });

    expect(integrationLane).toEqual([]);
    expect(checkLane.slice(-2)).toEqual([
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
      {
        args: [
          'turbo',
          'test:unit',
          '--concurrency=2',
          '--filter',
          'web',
          '--only',
          '--',
          'src/a.test.ts',
          'src/b.test.ts',
        ],
        command: 'bunx',
        label: 'test:unit',
      },
    ]);
  });

  it('puts integration tests in the second lane with concurrency 1', () => {
    const { checkLane, integrationLane } = buildValidationSteps({
      onlyE2e: false,
      plan: makePlan({
        testLayers: ['test:integration'],
        workspaceNames: ['server'],
      }),
      skipE2e: false,
    });

    expect(checkLane.filter((step) => step.label === 'test:unit')).toEqual([]);
    expect(integrationLane).toEqual([
      {
        args: [
          'turbo',
          'test:integration',
          '--concurrency=1',
          '--filter',
          'server',
          '--only',
          '--',
        ],
        command: 'bunx',
        label: 'test:integration',
      },
    ]);
  });

  it('plans the full E2E suite', () => {
    const steps = buildValidationSteps({
      onlyE2e: false,
      plan: makePlan({ e2eSpecPaths: ['x.spec.ts'], requiresFullE2e: true }),
      skipE2e: false,
    });

    expect(steps.e2eLabel).toBe('test:e2e (full suite)');
    expect(steps.e2eSteps).toEqual([
      { args: ['run', 'test:e2e'], command: 'bun', label: 'test:e2e' },
    ]);
  });

  it('plans affected journeys', () => {
    const steps = buildValidationSteps({
      onlyE2e: false,
      plan: makePlan({ e2eSpecPaths: ['a.spec.ts', 'b.spec.ts'] }),
      skipE2e: false,
    });

    expect(steps.e2eLabel).toBe('test:e2e (affected journeys)');
    expect(steps.e2eSteps).toEqual([
      {
        args: ['run', 'test:e2e', '--', 'a.spec.ts', 'b.spec.ts'],
        command: 'bun',
        label: 'test:e2e',
      },
    ]);
  });

  it('plans no E2E with skipE2e', () => {
    const steps = buildValidationSteps({
      onlyE2e: false,
      plan: makePlan({ requiresFullE2e: true }),
      skipE2e: true,
    });

    expect(steps.e2eSteps).toEqual([]);
  });

  it('adds the tooling test step when toolingTestPaths is non-empty', () => {
    const { checkLane, checkedLabels } = buildValidationSteps({
      onlyE2e: false,
      plan: makePlan({ toolingTestPaths: ['tooling/validation/affected.ts'] }),
      skipE2e: false,
    });

    expect(checkLane).toContainEqual({
      args: ['test', 'tooling'],
      command: 'bun',
      label: 'test:tooling',
    });
    expect(checkedLabels).toContain('test:tooling');
  });

  it('skips the tooling test step when onlyE2e', () => {
    const { checkLane } = buildValidationSteps({
      onlyE2e: true,
      plan: makePlan({ toolingTestPaths: ['tooling/validation/affected.ts'] }),
      skipE2e: false,
    });

    expect(checkLane).not.toContainEqual({
      args: ['test', 'tooling'],
      command: 'bun',
      label: 'test:tooling',
    });
  });

  it('plans only E2E with onlyE2e', () => {
    const steps = buildValidationSteps({
      onlyE2e: true,
      plan: makePlan({
        lintPaths: [LINT_PATH],
        testLayers: ['test:unit', 'test:integration'],
        requiresFullE2e: true,
        workspaceNames: ['web'],
      }),
      skipE2e: false,
    });

    expect(steps.checkLane).toEqual([]);
    expect(steps.integrationLane).toEqual([]);
    expect(steps.checkedLabels).toEqual([]);
    expect(steps.e2eSteps).toHaveLength(1);
  });
});
