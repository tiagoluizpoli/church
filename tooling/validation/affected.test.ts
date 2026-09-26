import { describe, expect, it } from 'bun:test';
import {
  classifyChanges,
  explainPlan,
  formatTimingSummary,
  parseArguments,
} from './affected';
import { CRITICAL_SMOKE_SPEC_PATHS } from './journey-map';

describe('parseArguments', () => {
  it('defaults to no base ref for a local working-tree diff', () => {
    const result = parseArguments({ args: [] });

    expect(result.baseRef).toBeUndefined();
  });

  it('reads --base as the ref to diff against for a CI merge-base diff', () => {
    const result = parseArguments({ args: ['--base', 'origin/develop'] });

    expect(result.baseRef).toBe('origin/develop');
  });

  it('throws when --base is missing its ref', () => {
    expect(() => parseArguments({ args: ['--base'] })).toThrow(
      '--base requires a ref.',
    );
  });

  it('defaults dailyGate to false, and reads --daily-gate as a standalone flag', () => {
    expect(parseArguments({ args: [] }).dailyGate).toBe(false);
    expect(parseArguments({ args: ['--daily-gate'] }).dailyGate).toBe(true);
  });

  it('defaults skipE2e and onlyE2e to false, and reads each as a standalone flag', () => {
    const defaults = parseArguments({ args: [] });
    expect(defaults.skipE2e).toBe(false);
    expect(defaults.onlyE2e).toBe(false);

    expect(parseArguments({ args: ['--skip-e2e'] }).skipE2e).toBe(true);
    expect(parseArguments({ args: ['--only-e2e'] }).onlyE2e).toBe(true);
  });

  it('rejects --skip-e2e combined with --only-e2e', () => {
    expect(() =>
      parseArguments({ args: ['--skip-e2e', '--only-e2e'] }),
    ).toThrow('--skip-e2e and --only-e2e are mutually exclusive.');
  });
});

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

  // #210's Implementation Decisions: the daily (task-branch to develop) gate
  // never requires the full E2E suite — only a develop to master release
  // gate does, gated on #121 being repeatedly green.
  it('never requires the complete E2E suite in daily-gate mode, even for Playwright infrastructure changes', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/playwright.config.ts'],
      dailyGate: true,
    });

    expect(plan.requiresFullE2e).toBe(false);
  });

  it('selects the critical smoke set for Playwright infrastructure changes in daily-gate mode', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/playwright.config.ts'],
      dailyGate: true,
    });

    expect(plan.requiresFullE2e).toBe(false);
    expect(plan.missingJourneyMappings).toEqual([]);
    for (const specPath of CRITICAL_SMOKE_SPEC_PATHS) {
      expect(plan.e2eSpecPaths).toContain(specPath);
    }
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

  it('never drops an explicitly declared spec when a changed path also selects mapped journeys', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/shared/utils/active-church-switch.ts'],
      e2eSpecPaths: ['tests/scheduling/builder-slot-focus.spec.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/identity/active-church-switching.spec.ts',
      'tests/scheduling/builder-slot-focus.spec.ts',
    ]);
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

  it('selects both redemption journeys and the transfer journey for a ministry-invitation route change', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/invitations/ministry/$invitationId.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/identity/redemption-existing-member.spec.ts',
      'tests/identity/redemption-new-user.spec.ts',
      'tests/identity/volunteer-transfer-journey.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the cross-tenant isolation journey for the Ministry Invitation admin controller', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/server/src/api/controllers/ministry-controller.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/identity/cross-tenant-invitation-isolation.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the cross-tenant isolation journey for the Ministry Invitation manager', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/server/src/application/db-ministry-invitation-manager.ts',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/identity/cross-tenant-invitation-isolation.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the route-protection journey for the authenticated guard, sign-in route, and landing redirect', () => {
    for (const changedPath of [
      'apps/web/src/routes/_authenticated.tsx',
      'apps/web/src/routes/login.tsx',
      'apps/web/src/shared/utils/return-target.ts',
      'apps/web/src/routes/_authenticated/_active-church/index.tsx',
    ]) {
      const plan = classifyChanges({ changedPaths: [changedPath] });

      expect(plan.e2eSpecPaths).toEqual([
        'tests/identity/route-protection.spec.ts',
      ]);
      expect(plan.missingJourneyMappings).toEqual([]);
    }
  });

  it('selects the transfer journey for the volunteer-transfer feature and its transfer manager', () => {
    for (const changedPath of [
      'apps/web/src/features/volunteer-transfer/components/volunteer-transfer-flow.tsx',
      'apps/server/src/application/db-volunteer-transfer-manager.ts',
    ]) {
      const plan = classifyChanges({ changedPaths: [changedPath] });

      expect(plan.e2eSpecPaths).toEqual([
        'tests/identity/volunteer-transfer-journey.spec.ts',
      ]);
      expect(plan.missingJourneyMappings).toEqual([]);
    }
  });

  it('selects both redemption journeys and the transfer journey for the shared redemption controller', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/server/src/api/controllers/redemption-controller.ts',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/identity/redemption-existing-member.spec.ts',
      'tests/identity/redemption-new-user.spec.ts',
      'tests/identity/volunteer-transfer-journey.spec.ts',
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

  it('selects the admin-plan journey for a planning-cycles route change', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/_active-church/scheduling/planning-cycles/new.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/a11y-planning-nav.spec.ts',
      'tests/scheduling/capability-index.spec.ts',
      'tests/scheduling/cross-cutting.spec.ts',
      'tests/scheduling/overnight-time-block.spec.ts',
      'tests/scheduling/planning-cross-tenant-isolation.spec.ts',
      'tests/scheduling/planning-cycles-table-view.spec.ts',
      'tests/scheduling/planning-nav-restructure.spec.ts',
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
      'tests/scheduling/single-create-event-ui.spec.ts',
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us1-admin-plan.spec.ts',
      'tests/scheduling/us4-roster-publish.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the admin-plan journey for a planning-admin feature component change', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/features/scheduling/components/planning-admin/create-cycle-form.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toContain(
      'tests/scheduling/us1-admin-plan.spec.ts',
    );
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the leader-tailor journey for a tailoring route change', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/_active-church/scheduling/tailoring/$ministryId/$cycleId.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/capability-index.spec.ts',
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us2-leader-tailor.spec.ts',
      'tests/scheduling/us4-roster-publish.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the leader-tailor journey for the tailoring API client', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/infrastructure/api/tailoring.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/us2-leader-tailor.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects both planning journeys for the shared generated planning API client', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/infrastructure/api/planning.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/cross-cutting.spec.ts',
      'tests/scheduling/overnight-time-block.spec.ts',
      'tests/scheduling/planning-cross-tenant-isolation.spec.ts',
      'tests/scheduling/planning-cycles-table-view.spec.ts',
      'tests/scheduling/planning-nav-restructure.spec.ts',
      'tests/scheduling/single-create-event-ui.spec.ts',
      'tests/scheduling/us1-admin-plan.spec.ts',
      'tests/scheduling/us2-leader-tailor.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the volunteer-dashboard journeys for the dashboard route and shell component', () => {
    for (const changedPath of [
      'apps/web/src/routes/_authenticated/_active-church/dashboard.tsx',
      'apps/web/src/features/volunteers/components/volunteer-dashboard.tsx',
      'apps/web/src/features/volunteers/hooks/use-volunteer-dashboard.ts',
    ]) {
      const plan = classifyChanges({ changedPaths: [changedPath] });

      expect(plan.e2eSpecPaths).toEqual([
        'tests/volunteer-dashboard/us1-availability.spec.ts',
        'tests/volunteer-dashboard/us2-assignments.spec.ts',
        'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
        'tests/volunteer-dashboard/us5-offline.spec.ts',
      ]);
      expect(plan.missingJourneyMappings).toEqual([]);
    }
  });

  it('selects only the Availability journey for the availability-needed section', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/features/volunteers/components/availability-needed-section.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/volunteer-dashboard/us1-availability.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the Assignment and #217 live-changes journeys for the upcoming-assignments section', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/features/volunteers/components/upcoming-assignments-section.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/us5-live-changes.spec.ts',
      'tests/volunteer-dashboard/us2-assignments.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects only the offline journey for the offline-specific dashboard files', () => {
    for (const changedPath of [
      'apps/web/src/features/volunteers/components/dashboard-offline-banner.tsx',
    ]) {
      const plan = classifyChanges({ changedPaths: [changedPath] });

      expect(plan.e2eSpecPaths).toEqual([
        'tests/volunteer-dashboard/us5-offline.spec.ts',
      ]);
      expect(plan.missingJourneyMappings).toEqual([]);
    }
  });

  it('selects the offline and availability journeys for the availability form', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/features/volunteers/components/availability-form.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/volunteer-dashboard/us1-availability.spec.ts',
      'tests/volunteer-dashboard/us5-offline.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects both the dashboard and notification-bell journeys for use-online-state', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/features/volunteers/hooks/use-online-state.ts',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/volunteer-dashboard/us-notification-bell.spec.ts',
      'tests/volunteer-dashboard/us1-availability.spec.ts',
      'tests/volunteer-dashboard/us2-assignments.spec.ts',
      'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
      'tests/volunteer-dashboard/us5-offline.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects only the notification-bell journey for the bell, inbox route, and inbox hook', () => {
    for (const changedPath of [
      'apps/web/src/components/notification-bell/notification-bell.tsx',
      'apps/web/src/routes/_authenticated/_active-church/notifications.tsx',
      'apps/web/src/features/volunteers/components/notifications-inbox-section.tsx',
      'apps/web/src/features/volunteers/hooks/use-notification-inbox.ts',
      'apps/web/src/features/volunteers/lib/notification-navigation.ts',
    ]) {
      const plan = classifyChanges({ changedPaths: [changedPath] });

      expect(plan.e2eSpecPaths).toEqual([
        'tests/volunteer-dashboard/us-notification-bell.spec.ts',
      ]);
      expect(plan.missingJourneyMappings).toEqual([]);
    }
  });

  it('selects the dashboard and notification-bell journeys for dashboard-query-options', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/features/volunteers/lib/dashboard-query-options.ts',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/volunteer-dashboard/us-notification-bell.spec.ts',
      'tests/volunteer-dashboard/us1-availability.spec.ts',
      'tests/volunteer-dashboard/us2-assignments.spec.ts',
      'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
      'tests/volunteer-dashboard/us5-offline.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the published-schedule journeys for the ministry-schedule section', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/features/volunteers/components/ministry-schedule-section.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/us4-roster-publish.spec.ts',
      'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the volunteer-dashboard, notification-bell, us3-availability, and roster-publish journeys for the volunteer API client', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/infrastructure/api/volunteer.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/us3-volunteer-availability.spec.ts',
      'tests/scheduling/us4-roster-publish.spec.ts',
      'tests/volunteer-dashboard/us-notification-bell.spec.ts',
      'tests/volunteer-dashboard/us1-availability.spec.ts',
      'tests/volunteer-dashboard/us2-assignments.spec.ts',
      'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
      'tests/volunteer-dashboard/us5-offline.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the roster-publish and #217 guard/edge journeys for the rostering API client', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/infrastructure/api/rostering.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/builder-slot-focus.spec.ts',
      'tests/scheduling/qualification.spec.ts',
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us4-roster-publish.spec.ts',
      'tests/scheduling/us5-live-changes.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the Church-isolation and lock-edge-case journeys for the planning-cycles route', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/_active-church/scheduling/planning-cycles.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toContain(
      'tests/scheduling/cross-cutting.spec.ts',
    );
    expect(plan.e2eSpecPaths).toContain(
      'tests/scheduling/planning-cross-tenant-isolation.spec.ts',
    );
    expect(plan.e2eSpecPaths).toContain(
      'tests/scheduling/single-create-event-ui.spec.ts',
    );
    expect(plan.e2eSpecPaths).toContain(
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
    );
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the guard-matrix journey for the tailoring route and the scheduling route family', () => {
    const tailoringPlan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/_active-church/scheduling/tailoring.tsx',
      ],
    });
    expect(tailoringPlan.e2eSpecPaths).toContain(
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
    );

    const indexPlan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/_active-church/scheduling/index.tsx',
      ],
    });
    expect(indexPlan.e2eSpecPaths).toEqual([
      'tests/scheduling/capability-index.spec.ts',
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us4-roster-publish.spec.ts',
    ]);
  });

  it('selects the eligibility and cross-route guard journeys for the scheduling feature', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/features/scheduling/hooks/use-cycle-builder.ts',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/builder-slot-focus.spec.ts',
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
      'tests/scheduling/qualification.spec.ts',
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us3-volunteer-availability.spec.ts',
      'tests/scheduling/us4-roster-publish.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the #217 guard/edge journeys for the church-admin, rostering, and volunteer controllers', () => {
    const churchAdminPlan = classifyChanges({
      changedPaths: [
        'apps/server/src/api/controllers/church-admin-controller.ts',
      ],
    });
    expect(churchAdminPlan.e2eSpecPaths).toEqual([
      'tests/scheduling/cross-cutting.spec.ts',
      'tests/scheduling/planning-cross-tenant-isolation.spec.ts',
      'tests/scheduling/single-create-event-ui.spec.ts',
    ]);

    const rosteringPlan = classifyChanges({
      changedPaths: ['apps/server/src/api/controllers/rostering-controller.ts'],
    });
    expect(rosteringPlan.e2eSpecPaths).toEqual([
      'tests/scheduling/builder-slot-focus.spec.ts',
      'tests/scheduling/qualification.spec.ts',
      'tests/scheduling/us5-live-changes.spec.ts',
    ]);

    const volunteerControllerPlan = classifyChanges({
      changedPaths: ['apps/server/src/api/controllers/volunteer-controller.ts'],
    });
    expect(volunteerControllerPlan.e2eSpecPaths).toEqual([
      'tests/scheduling/us5-live-changes.spec.ts',
      'tests/volunteer-dashboard/us-notification-bell.spec.ts',
    ]);
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

  // #219 — a11y-builder.spec.ts and a11y-planning-nav.spec.ts stayed at the
  // Playwright layer (axe-core needs real browser paint) and were mapped
  // precisely so an unrelated web-shell change doesn't pull them in.
  it('selects the a11y-builder journey for a schedule builder feature component change', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/features/scheduling/components/builder/cycle-builder-header.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toContain(
      'tests/scheduling/a11y-builder.spec.ts',
    );
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the a11y-builder journey for a rostering route change', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/_active-church/scheduling/rostering/$ministryId/$cycleId.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/a11y-builder.spec.ts',
      'tests/scheduling/capability-index.spec.ts',
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us4-roster-publish.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the a11y-planning-nav journey for an app-shell change', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/components/app-shell.tsx'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/a11y-planning-nav.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('records why each selected workspace and journey was chosen', () => {
    const plan = classifyChanges({
      changedPaths: ['packages/core/src/entity.ts'],
    });

    expect(plan.workspaceSelectionReasons).toContainEqual({
      changedPath: 'packages/core/src/entity.ts',
      detail: 'direct',
      workspaceName: '@church/core',
    });
    expect(plan.workspaceSelectionReasons).toContainEqual({
      changedPath: 'packages/core/src/entity.ts',
      detail: 'dependent-of:@church/core',
      workspaceName: 'server',
    });
  });

  it('records the critical-smoke-fallback reason for an unmapped production change', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/routes/dashboard.tsx'],
    });

    expect(plan.journeySelectionReasons).toContainEqual({
      changedPath: null,
      detail: 'critical-smoke-fallback',
      specPath: 'tests/scheduling/smoke.spec.ts',
    });
  });

  it('records the explicit reason for an --e2e-requested spec', () => {
    const plan = classifyChanges({
      changedPaths: [],
      e2eSpecPaths: ['tests/scheduling/builder-slot-focus.spec.ts'],
    });

    expect(plan.journeySelectionReasons).toEqual([
      {
        changedPath: null,
        detail: 'explicit',
        specPath: 'tests/scheduling/builder-slot-focus.spec.ts',
      },
    ]);
  });
});

describe('explainPlan', () => {
  it('renders the base ref, selected workspaces with reasons, and selected journeys with reasons', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/shared/utils/active-church-switch.ts'],
    });

    const explanation = explainPlan({ baseRef: 'develop', plan });

    expect(explanation).toContain('Base ref: develop');
    expect(explanation).toContain('web');
    expect(explanation).toContain(
      'direct <- apps/web/src/shared/utils/active-church-switch.ts',
    );
    expect(explanation).toContain('Test layers selected: test:unit');
    expect(explanation).toContain(
      'tests/identity/active-church-switching.spec.ts',
    );
    expect(explanation).toContain(
      'mapped:apps/web/src/shared/utils/active-church-switch.ts',
    );
  });

  it('renders a fallback label when no base ref was resolved', () => {
    const plan = classifyChanges({ changedPaths: [] });

    expect(explainPlan({ baseRef: undefined, plan })).toContain(
      'Base ref: (none — working tree only)',
    );
  });

  it('lists missing journey mappings when the smoke set falls back', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/routes/dashboard.tsx'],
    });

    const explanation = explainPlan({ baseRef: 'develop', plan });

    expect(explanation).toContain('Missing journey mappings');
    expect(explanation).toContain('apps/web/src/routes/dashboard.tsx');
  });
});

describe('formatTimingSummary', () => {
  it('renders a markdown table with each check and its elapsed seconds', () => {
    const summary = formatTimingSummary({
      timings: [
        { label: 'lint', ms: 1234 },
        { label: 'typecheck', ms: 5000 },
      ],
    });

    expect(summary).toBe(
      [
        '| Check | Elapsed |',
        '| --- | --- |',
        '| lint | 1.2s |',
        '| typecheck | 5.0s |',
      ].join('\n'),
    );
  });

  it('renders just the header rows for no timings', () => {
    expect(formatTimingSummary({ timings: [] })).toBe(
      ['| Check | Elapsed |', '| --- | --- |'].join('\n'),
    );
  });
});
