import { describe, expect, it } from 'bun:test';
import { classifyChanges, explainPlan } from '../../validation/affected';
import { CRITICAL_SMOKE_SPEC_PATHS } from '../../validation/journey-map';

const BASE_REF = 'develop';
const IGNORED_HEADING = 'Changed files ignored by journey selection:';
const MAPPED = 'apps/web/src/shared/utils/active-church-switch.ts';
const UNMAPPED = 'apps/server/src/main/di/build-managers.ts';

describe('journey selection for changes no mapping decides', () => {
  it('selects no journey and reports no missing mapping for non-production changes', () => {
    const plan = classifyChanges({
      changedPaths: [
        'README.md',
        'apps/web/tests/lib/some.unit.test.ts',
        'packages/time/src/conversion.ts',
        'tooling/validation/affected.ts',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('keeps dependency-injection wiring on the critical smoke set and prints it', () => {
    const changedPath = 'apps/server/src/main/di/build-managers.ts';
    const plan = classifyChanges({ changedPaths: [changedPath] });

    expect(plan.e2eSpecPaths).toEqual([...CRITICAL_SMOKE_SPEC_PATHS].sort());
    expect(plan.missingJourneyMappings).toEqual([changedPath]);
    expect(explainPlan({ baseRef: BASE_REF, plan })).toContain(
      `Missing journey mappings (fell back to critical smoke set):\n  - ${changedPath}`,
    );
  });
});

describe('ignored changed files', () => {
  it('lists every changed file that selected no journey', () => {
    const plan = classifyChanges({
      changedPaths: [
        MAPPED,
        UNMAPPED,
        'packages/time/src/conversion.ts',
        'apps/web/public/robots.txt',
        'README.md',
        'apps/web/src/gone.ts',
      ],
      deletedPaths: ['apps/web/src/gone.ts'],
    });
    const ignored = [
      'README.md',
      'apps/web/public/robots.txt',
      'apps/web/src/gone.ts',
      'packages/time/src/conversion.ts',
    ];

    expect(plan.ignoredPaths).toEqual(ignored);
    expect(explainPlan({ baseRef: BASE_REF, plan })).toContain(
      [IGNORED_HEADING, ...ignored.map((path) => `  - ${path}`)].join('\n'),
    );
  });

  it('prints no ignored section when every change selects a journey', () => {
    const plan = classifyChanges({
      changedPaths: [MAPPED, 'apps/web/playwright.config.ts'],
      dailyGate: true,
    });

    expect(plan.ignoredPaths).toEqual([]);
    expect(explainPlan({ baseRef: BASE_REF, plan })).not.toContain(
      IGNORED_HEADING,
    );
  });
});

describe('Journey-Impact acknowledgement', () => {
  it('skips the journeys the changes select and prints the reason', () => {
    const plan = classifyChanges({
      changedPaths: [MAPPED, UNMAPPED, 'apps/web/playwright.config.ts'],
      journeyImpactAcknowledgements: ['pure rename'],
    });

    expect(plan.e2eSpecPaths).toEqual([]);
    expect(plan.journeySelectionReasons).toEqual([]);
    expect(plan.missingJourneyMappings).toEqual([]);
    expect(plan.requiresFullE2e).toBe(false);
    expect(explainPlan({ baseRef: BASE_REF, plan })).toContain(
      'Journey impact: acknowledged, journeys skipped\n  acknowledged: pure rename',
    );
    expect(plan.workspaceNames).toEqual(['server', 'web']);
  });

  it('keeps explicitly requested specs', () => {
    const e2eSpecPaths = ['tests/scheduling/smoke.spec.ts'];
    const plan = classifyChanges({
      changedPaths: [MAPPED],
      e2eSpecPaths,
      journeyImpactAcknowledgements: ['pure rename'],
    });

    expect(plan.e2eSpecPaths).toEqual(e2eSpecPaths);
  });

  it('ignores a blank reason', () => {
    const plan = classifyChanges({
      changedPaths: [MAPPED],
      journeyImpactAcknowledgements: ['  '],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/identity/active-church-switching.spec.ts',
    ]);
    expect(plan.journeyImpactAcknowledgements).toEqual([]);
  });
});
