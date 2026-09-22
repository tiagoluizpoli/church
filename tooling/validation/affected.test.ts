import { describe, expect, it } from 'bun:test';
import { classifyChanges } from './affected';
import { CRITICAL_SMOKE_SPEC_PATHS } from './journey-map';

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

  it('selects transitive dependents of the time seam', () => {
    const plan = classifyChanges({
      changedPaths: ['packages/time/src/conversion.ts'],
    });

    // @church/auth depends on @church/db, which depends on @church/time.
    expect(plan.workspaceNames).toEqual([
      '@church/auth',
      '@church/db',
      '@church/time',
      'server',
      'web',
    ]);
  });

  it('requires the complete E2E suite for Playwright infrastructure changes', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/playwright.config.ts'],
    });

    expect(plan.requiresFullE2e).toBe(true);
  });

  it('runs an explicitly declared E2E spec without selecting the complete suite', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/README.md'],
      e2eSpecPaths: ['tests/scheduling/builder-slot-focus.spec.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/builder-slot-focus.spec.ts',
    ]);
    expect(plan.requiresFullE2e).toBe(false);
  });

  it('selects the mapped critical journey for a source change with a journey-map entry', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/shared/utils/active-church-switch.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/identity/active-church-switching.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
    expect(plan.requiresFullE2e).toBe(false);
  });

  it('selects both redemption journeys for a chained-invitation route change', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/invitations/church/$invitationId.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/identity/redemption-existing-member.spec.ts',
      'tests/identity/redemption-new-user.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects both redemption journeys for a ministry-invitation route change', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/invitations/ministry/$invitationId.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/identity/redemption-existing-member.spec.ts',
      'tests/identity/redemption-new-user.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects both redemption journeys for a redemption API client change', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/infrastructure/api/redemption.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/identity/redemption-existing-member.spec.ts',
      'tests/identity/redemption-new-user.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('runs the critical smoke set and reports the gap for an unmapped production change', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/routes/dashboard.tsx'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/identity/active-church-switching.spec.ts',
      'tests/identity/redemption-existing-member.spec.ts',
      'tests/identity/redemption-new-user.spec.ts',
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us3-volunteer-availability.spec.ts',
      'tests/scheduling/us4-roster-publish.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([
      'apps/web/src/routes/dashboard.tsx',
    ]);
    expect(plan.requiresFullE2e).toBe(false);
  });

  it('adds an explicit extra spec on top of the smoke-set fallback without removing it', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/server/src/domain/unmapped-rule.ts'],
      e2eSpecPaths: ['tests/scheduling/qualification.spec.ts'],
    });

    expect(plan.e2eSpecPaths).toContain(
      'tests/scheduling/qualification.spec.ts',
    );
    for (const specPath of CRITICAL_SMOKE_SPEC_PATHS) {
      expect(plan.e2eSpecPaths).toContain(specPath);
    }
  });

  it('escalates to the full suite instead of the smoke set for shared E2E infrastructure', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/playwright.config.ts'],
    });

    expect(plan.requiresFullE2e).toBe(true);
    expect(plan.missingJourneyMappings).toEqual([]);
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
