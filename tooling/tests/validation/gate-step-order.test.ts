import { describe, expect, it } from 'bun:test';
import { buildValidationSteps } from '../../validation/affected';
import { LINT_TYPECHECK_UNIT_LANE } from '../../validation/validate';
import { makePlan } from './plan';

const GUARD_LABELS = [
  'test-placement',
  'i18n-parity',
  'named-parameters',
  'server-types',
  'journey-map',
  'presentation-text',
  'date-time-seam',
  'bun-version',
];

const webSteps = () =>
  buildValidationSteps({
    onlyE2e: false,
    plan: makePlan({ workspaceNames: ['web'] }),
    skipE2e: false,
  });

describe('gate step order', () => {
  it('validate runs lint, typecheck, the bundle budget, then unit tests', () => {
    expect(LINT_TYPECHECK_UNIT_LANE.map(({ label }) => label)).toEqual([
      'lint',
      'typecheck',
      'bundle-budget',
      'test:unit',
    ]);
  });

  it('validate:affected ends the web check lane with the bundle budget', () => {
    expect(webSteps().checkLane.map(({ label }) => label)).toEqual([
      ...GUARD_LABELS,
      'typecheck',
      'bundle-budget',
    ]);
  });

  it('plans no bundle budget when web is not affected', () => {
    const { checkLane } = buildValidationSteps({
      onlyE2e: false,
      plan: makePlan({ workspaceNames: ['server'] }),
      skipE2e: false,
    });

    expect(checkLane.map(({ label }) => label)).not.toContain('bundle-budget');
  });

  it('validate:affected reports these stages in the summary table', () => {
    expect(webSteps().checkedLabels).toEqual([
      'lint',
      ...GUARD_LABELS,
      'typecheck',
      'bundle-budget',
      'test:unit',
      'test:integration',
    ]);
  });
});
