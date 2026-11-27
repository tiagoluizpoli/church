import { describe, expect, it } from 'bun:test';
import { classifyChanges, explainPlan } from '../../validation/affected';
import { CRITICAL_SMOKE_SPEC_PATHS } from '../../validation/journey-map';

const BASE_REF = 'develop';

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
