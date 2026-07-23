import { describe, expect, it } from 'bun:test';
import { classifyChanges } from './affected';

describe('classifyChanges', () => {
  it('selects the web unit layer for an isolated web source change', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/utils/format-volunteer-initials.ts'],
    });

    expect(plan.workspaceNames).toEqual(['web']);
    expect(plan.testLayers).toEqual(['test:unit']);
    expect(plan.requiresFullE2e).toBe(false);
  });

  it('selects dependents when a shared package changes', () => {
    const plan = classifyChanges({
      changedPaths: ['packages/core/src/entity.ts'],
    });

    expect(plan.workspaceNames).toEqual(['@church/core', 'server']);
    expect(plan.testLayers).toEqual(['test:unit', 'test:integration']);
  });

  it('requires the complete E2E suite for Playwright infrastructure changes', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/playwright.config.ts'],
    });

    expect(plan.requiresFullE2e).toBe(true);
  });

  it('runs an explicitly declared E2E spec without selecting the complete suite', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/routes/dashboard.tsx'],
      e2eSpecPaths: ['tests/scheduling/builder-slot-focus.spec.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/builder-slot-focus.spec.ts',
    ]);
    expect(plan.requiresFullE2e).toBe(false);
  });

  it('does not run E2E merely because a spec is being edited', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/tests/scheduling/builder-slot-focus.spec.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([]);
    expect(plan.requiresFullE2e).toBe(false);
  });

  it('runs a changed unit test file directly instead of the whole layer', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/utils/format-volunteer-initials.unit.test.ts',
      ],
    });

    expect(plan.testTargets).toEqual([
      {
        testLayer: 'test:unit',
        testPath: 'src/utils/format-volunteer-initials.unit.test.ts',
        workspaceName: 'web',
      },
    ]);
  });

  it('selects the server integration project for an application integration test', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/server/tests/application/planning-phase3.managers.test.ts',
      ],
    });

    expect(plan.testTargets).toEqual([
      {
        testLayer: 'test:integration',
        testPath: 'tests/application/planning-phase3.managers.test.ts',
        workspaceName: 'server',
      },
    ]);
  });
});
