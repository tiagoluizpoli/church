import { describe, expect, it } from 'bun:test';
import { buildValidationSteps } from '../../validation/affected';
import { LINT_TYPECHECK_UNIT_LANE } from '../../validation/validate';
import { makePlan } from './plan';

const GUARD_LABELS = [
  'test-placement',
  'i18n-parity',
  'named-parameters',
  'journey-map',
  'presentation-text',
  'date-time-seam',
];

const webSteps = () =>
  buildValidationSteps({
    onlyE2e: false,
    plan: makePlan({ workspaceNames: ['web'] }),
    skipE2e: false,
  });

describe('gate step order', () => {
  it('validate runs lint, typecheck, then unit tests', () => {
    expect(LINT_TYPECHECK_UNIT_LANE.map(({ label }) => label)).toEqual([
      'lint',
      'typecheck',
      'test:unit',
    ]);
  });

  it('validate:affected ends the web check lane with typecheck', () => {
    expect(webSteps().checkLane.map(({ label }) => label)).toEqual([
      ...GUARD_LABELS,
      'typecheck',
    ]);
  });

  it('validate:affected reports these stages in the summary table', () => {
    expect(webSteps().checkedLabels).toEqual([
      'lint',
      ...GUARD_LABELS,
      'typecheck',
      'test:unit',
      'test:integration',
    ]);
  });
});
