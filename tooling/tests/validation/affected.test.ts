import { describe, expect, it } from 'bun:test';
import {
  classifyChanges,
  explainPlan,
  formatTimingSummary,
  isScriptsOnlyAddition,
  parseArguments,
  readSeedImpactTrailers,
} from '../../validation/affected';
import { CRITICAL_SMOKE_SPEC_PATHS } from '../../validation/journey-map';

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
      e2eSpecPaths: ['tests/scheduling/builder-event-time-block-focus.spec.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/builder-event-time-block-focus.spec.ts',
    ]);
    expect(plan.requiresFullE2e).toBe(false);
  });

  it('never drops an explicitly declared spec when a changed path also selects mapped journeys', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/shared/utils/active-church-switch.ts'],
      e2eSpecPaths: ['tests/scheduling/builder-event-time-block-focus.spec.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/identity/active-church-switching.spec.ts',
      'tests/scheduling/builder-event-time-block-focus.spec.ts',
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

  it('selects the admin-plan journey for a cycles route change', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/_active-church/_planning-admin/cycles/new.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/a11y-planning-nav.spec.ts',
      'tests/scheduling/cross-cutting.spec.ts',
      'tests/scheduling/cycles-table-view.spec.ts',
      'tests/scheduling/event-templates.spec.ts',
      'tests/scheduling/planning-cross-tenant-isolation.spec.ts',
      'tests/scheduling/planning-nav-restructure.spec.ts',
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
      'tests/scheduling/single-create-event-ui.spec.ts',
      'tests/scheduling/us1-admin-plan.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the admin-plan journey for a planning-admin feature component change', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/features/scheduling/components/planning-admin/create-cycle-form.tsx',
      ],
    });

    // #289 — previously also pulled in smoke/us3/us4/qualification/
    // builder-event-time-block-focus via the removed broad `features/scheduling/`
    // prefix (13 specs); none of those navigate a cycles route.
    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/cross-cutting.spec.ts',
      'tests/scheduling/cycles-table-view.spec.ts',
      'tests/scheduling/event-templates.spec.ts',
      'tests/scheduling/planning-cross-tenant-isolation.spec.ts',
      'tests/scheduling/planning-nav-restructure.spec.ts',
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
      'tests/scheduling/single-create-event-ui.spec.ts',
      'tests/scheduling/us1-admin-plan.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the same admin-plan journey for the top-level planning-admin container and its quick-create modal', () => {
    for (const changedPath of [
      'apps/web/src/features/scheduling/components/planning-admin.tsx',
      'apps/web/src/features/scheduling/components/quick-create-event-modal.tsx',
    ]) {
      const plan = classifyChanges({ changedPaths: [changedPath] });

      expect(plan.e2eSpecPaths).toEqual([
        'tests/scheduling/cross-cutting.spec.ts',
        'tests/scheduling/cycles-table-view.spec.ts',
        'tests/scheduling/event-templates.spec.ts',
        'tests/scheduling/planning-cross-tenant-isolation.spec.ts',
        'tests/scheduling/planning-nav-restructure.spec.ts',
        'tests/scheduling/planning-role-guard-matrix.spec.ts',
        'tests/scheduling/single-create-event-ui.spec.ts',
        'tests/scheduling/us1-admin-plan.spec.ts',
      ]);
      expect(plan.missingJourneyMappings).toEqual([]);
    }
  });

  it('selects the leader-prepare journey for a prepare route change', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/_active-church/schedules/$ministryId/$cycleId/index.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
      'tests/scheduling/us2-leader-prepare.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the prepare-component journey for a prepare feature component and its shared util', () => {
    // #289 — previously also pulled in qualification/us3/builder-event-time-block-focus
    // via the removed broad `features/scheduling/` prefix (7 specs); those
    // never navigate a prepare route.
    for (const changedPath of [
      'apps/web/src/features/scheduling/components/prepare/split-shift-dialog.tsx',
      'apps/web/src/features/scheduling/components/participation-prepare.utils.ts',
    ]) {
      const plan = classifyChanges({ changedPaths: [changedPath] });

      expect(plan.e2eSpecPaths).toEqual([
        'tests/scheduling/planning-role-guard-matrix.spec.ts',
        'tests/scheduling/smoke.spec.ts',
        'tests/scheduling/us2-leader-prepare.spec.ts',
        'tests/scheduling/us4-schedule-publish.spec.ts',
      ]);
      expect(plan.missingJourneyMappings).toEqual([]);
    }
  });

  it('selects the leader-prepare journey for the prepare API client', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/infrastructure/api/prepare.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/us2-leader-prepare.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects both planning journeys for the shared generated planning API client', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/infrastructure/api/planning.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/cross-cutting.spec.ts',
      'tests/scheduling/cycles-table-view.spec.ts',
      'tests/scheduling/event-templates.spec.ts',
      'tests/scheduling/planning-cross-tenant-isolation.spec.ts',
      'tests/scheduling/planning-nav-restructure.spec.ts',
      'tests/scheduling/single-create-event-ui.spec.ts',
      'tests/scheduling/us1-admin-plan.spec.ts',
      'tests/scheduling/us2-leader-prepare.spec.ts',
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

  it('falls back to the critical smoke set for the upcoming-assignments section', () => {
    const changedPath =
      'apps/web/src/features/volunteers/components/upcoming-assignments-section.tsx';
    const plan = classifyChanges({ changedPaths: [changedPath] });

    expect(plan.e2eSpecPaths).toEqual(
      expect.arrayContaining(CRITICAL_SMOKE_SPEC_PATHS),
    );
    expect(plan.missingJourneyMappings).toEqual([changedPath]);
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
      'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
      'tests/volunteer-dashboard/us5-offline.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects only the notification-bell journey for the bell, inbox route, and inbox hook', () => {
    for (const changedPath of [
      'apps/web/src/features/volunteers/components/notification-bell.tsx',
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
      'tests/scheduling/us4-schedule-publish.spec.ts',
      'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the volunteer-dashboard, notification-bell, us3-availability, and schedule-publish journeys for the volunteer API client', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/infrastructure/api/volunteer.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/us3-volunteer-availability.spec.ts',
      'tests/scheduling/us4-schedule-publish.spec.ts',
      'tests/volunteer-dashboard/us-notification-bell.spec.ts',
      'tests/volunteer-dashboard/us1-availability.spec.ts',
      'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
      'tests/volunteer-dashboard/us5-offline.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the schedule-publish and #217 guard/edge journeys for the assign API client', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/infrastructure/api/assign.ts'],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/builder-event-time-block-focus.spec.ts',
      'tests/scheduling/qualification.spec.ts',
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us4-schedule-publish.spec.ts',
      'tests/scheduling/us5-leader-reassign.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects the Church-isolation and send-edge-case journeys for the cycles route', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/_active-church/_planning-admin.tsx',
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

  it('selects the guard-matrix journey for the prepare route, and only the capability-index journey for the scheduling index route', () => {
    const preparePlan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/_active-church/schedules.tsx',
      ],
    });
    expect(preparePlan.e2eSpecPaths).toContain(
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
    );

    // #288 — the index route's own spec (capability-index.spec.ts) is the
    // only one that navigates to the bare `/scheduling` route this file
    // renders; it no longer pulls in smoke/schedule-publish/guard-matrix via
    // the removed broad `.../scheduling` prefix.
    const indexPlan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/_active-church/scheduling/index.tsx',
      ],
    });
    expect(indexPlan.e2eSpecPaths).toEqual([
      'tests/scheduling/capability-index.spec.ts',
    ]);
  });

  it('selects the builder journey for the cycle-builder hooks, volunteer-pool hook, drag-scroll hook, and builder utils', () => {
    // #289 — previously also pulled in us3-volunteer-availability via the
    // removed broad `features/scheduling/` prefix; that spec never navigates
    // the assign builder URL. planning-role-guard-matrix.spec.ts stays in
    // this set (unlike us3) because it does navigate the builder URL and
    // asserts directly on the `cycle-builder` testid.
    for (const changedPath of [
      'apps/web/src/features/scheduling/hooks/use-cycle-builder.ts',
      'apps/web/src/features/scheduling/hooks/use-cycle-builder-actions.ts',
      'apps/web/src/features/scheduling/hooks/use-cycle-builder.optimistic.ts',
      'apps/web/src/features/scheduling/hooks/use-volunteer-pool.ts',
      'apps/web/src/features/scheduling/hooks/use-cycle-board-drag-scroll.ts',
      'apps/web/src/features/scheduling/utils/builder/cycle-builder-fit.utils.ts',
    ]) {
      const plan = classifyChanges({ changedPaths: [changedPath] });

      expect(plan.e2eSpecPaths).toEqual([
        'tests/scheduling/a11y-builder.spec.ts',
        'tests/scheduling/builder-event-time-block-focus.spec.ts',
        'tests/scheduling/planning-role-guard-matrix.spec.ts',
        'tests/scheduling/qualification.spec.ts',
        'tests/scheduling/smoke.spec.ts',
      ]);
      expect(plan.missingJourneyMappings).toEqual([]);
    }
  });

  it('selects only the availability journey for the availability-status feature files', () => {
    for (const changedPath of [
      'apps/web/src/features/scheduling/components/availability-status-section.tsx',
      'apps/web/src/features/scheduling/utils/availability-status.ts',
    ]) {
      const plan = classifyChanges({ changedPaths: [changedPath] });

      expect(plan.e2eSpecPaths).toEqual([
        'tests/scheduling/us3-volunteer-availability.spec.ts',
      ]);
      expect(plan.missingJourneyMappings).toEqual([]);
    }
  });

  it('selects only the a11y-planning-nav journey for the breadcrumb hooks', () => {
    for (const changedPath of [
      'apps/web/src/features/scheduling/hooks/use-ministry-breadcrumb.ts',
      'apps/web/src/features/scheduling/hooks/use-cycle-breadcrumb.ts',
    ]) {
      const plan = classifyChanges({ changedPaths: [changedPath] });

      expect(plan.e2eSpecPaths).toEqual([
        'tests/scheduling/a11y-planning-nav.spec.ts',
      ]);
      expect(plan.missingJourneyMappings).toEqual([]);
    }
  });

  it('selects the #217 guard/edge journeys for the church-admin, assign, and volunteer controllers', () => {
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

    const assignPlan = classifyChanges({
      changedPaths: ['apps/server/src/api/controllers/assign-controller.ts'],
    });
    expect(assignPlan.e2eSpecPaths).toEqual([
      'tests/scheduling/builder-event-time-block-focus.spec.ts',
      'tests/scheduling/qualification.spec.ts',
      'tests/scheduling/us5-leader-reassign.spec.ts',
    ]);

    const volunteerControllerPlan = classifyChanges({
      changedPaths: ['apps/server/src/api/controllers/volunteer-controller.ts'],
    });
    expect(volunteerControllerPlan.e2eSpecPaths).toEqual([
      'tests/scheduling/us5-leader-reassign.spec.ts',
      'tests/volunteer-dashboard/us-notification-bell.spec.ts',
    ]);

    const journeyRecipePlan = classifyChanges({
      changedPaths: [
        'apps/server/seeds/e2e/recipes/volunteer-assignments.ts',
        'apps/server/seeds/builders/scheduling.ts',
        'apps/server/seeds/recipe.ts',
        'apps/server/seeds/blueprints/credentials.ts',
        'apps/server/src/scripts/provision-church.ts',
        'apps/server/src/scripts/ensure-platform-operator.ts',
      ],
    });
    expect(journeyRecipePlan.e2eSpecPaths).toEqual([
      'tests/identity/active-church-switching.spec.ts',
      'tests/identity/cross-tenant-invitation-isolation.spec.ts',
      'tests/identity/redemption-existing-member.spec.ts',
      'tests/identity/redemption-new-user.spec.ts',
      'tests/identity/route-protection.spec.ts',
      'tests/identity/volunteer-transfer-journey.spec.ts',
      'tests/scheduling/a11y-builder.spec.ts',
      'tests/scheduling/a11y-planning-nav.spec.ts',
      'tests/scheduling/builder-event-time-block-focus.spec.ts',
      'tests/scheduling/capability-index.spec.ts',
      'tests/scheduling/cross-cutting.spec.ts',
      'tests/scheduling/cycles-table-view.spec.ts',
      'tests/scheduling/event-templates.spec.ts',
      'tests/scheduling/planning-cross-tenant-isolation.spec.ts',
      'tests/scheduling/planning-nav-restructure.spec.ts',
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
      'tests/scheduling/qualification.spec.ts',
      'tests/scheduling/single-create-event-ui.spec.ts',
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us1-admin-plan.spec.ts',
      'tests/scheduling/us2-leader-prepare.spec.ts',
      'tests/scheduling/us3-volunteer-availability.spec.ts',
      'tests/scheduling/us4-schedule-publish.spec.ts',
      'tests/scheduling/us5-leader-reassign.spec.ts',
      'tests/volunteer-dashboard/us-notification-bell.spec.ts',
      'tests/volunteer-dashboard/us1-availability.spec.ts',
      'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
      'tests/volunteer-dashboard/us5-offline.spec.ts',
    ]);
    expect(journeyRecipePlan.missingJourneyMappings).toEqual([]);
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
      'tests/scheduling/us4-schedule-publish.spec.ts',
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

  // #203 makes the redemption journeys the story gate for the cross-process
  // invitation failure; these files choose the database every E2E process
  // targets, so a regression in any of them must not pass the gate green.
  const E2E_DATABASE_TARGET_PATHS = [
    'packages/db/src/e2e-database-url.ts',
    'packages/db/src/purpose-database-url-guard.ts',
    'packages/db/src/database-target-resolver.ts',
    'tooling/env/e2e-environment.ts',
    'tooling/env/e2e-process-preflight.ts',
    'tooling/env/e2e-local-lifecycle.ts',
  ];

  it('escalates to the full suite for E2E database-target code', () => {
    for (const changedPath of E2E_DATABASE_TARGET_PATHS) {
      const plan = classifyChanges({ changedPaths: [changedPath] });

      expect({ changedPath, requiresFullE2e: plan.requiresFullE2e }).toEqual({
        changedPath,
        requiresFullE2e: true,
      });
    }
  });

  it('selects the redemption journeys for E2E database-target code in daily-gate mode', () => {
    for (const changedPath of E2E_DATABASE_TARGET_PATHS) {
      const plan = classifyChanges({
        changedPaths: [changedPath],
        dailyGate: true,
      });

      expect({ changedPath, e2eSpecPaths: plan.e2eSpecPaths }).toEqual({
        changedPath,
        e2eSpecPaths: expect.arrayContaining([
          'tests/identity/redemption-existing-member.spec.ts',
          'tests/identity/redemption-new-user.spec.ts',
        ]),
      });
    }
  });

  it('runs only an edited spec, never the full suite', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/tests/scheduling/builder-event-time-block-focus.spec.ts',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/builder-event-time-block-focus.spec.ts',
    ]);
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
  it('selects the builder journey for a schedule builder feature component change', () => {
    // #289 — previously also pulled in us3-volunteer-availability via the
    // removed broad `features/scheduling/` prefix; that spec never navigates
    // the assign builder URL. planning-role-guard-matrix.spec.ts stays in
    // this set (unlike us3) because it does navigate the builder URL and
    // asserts directly on the `cycle-builder` testid.
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/features/scheduling/components/builder/cycle-builder-header.tsx',
      ],
    });

    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/a11y-builder.spec.ts',
      'tests/scheduling/builder-event-time-block-focus.spec.ts',
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
      'tests/scheduling/qualification.spec.ts',
      'tests/scheduling/smoke.spec.ts',
    ]);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('selects only the a11y-builder journey for an assign route change', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/routes/_authenticated/_active-church/schedules/$ministryId/$cycleId/assign.tsx',
      ],
    });

    // #288 — previously also picked up capability-index/guard-matrix/smoke/
    // schedule-publish solely via the removed broad `.../scheduling` prefix;
    // none of those specs navigate to an assign-only URL.
    expect(plan.e2eSpecPaths).toEqual([
      'tests/scheduling/a11y-builder.spec.ts',
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

  it('records why each selected test layer was chosen, mirroring its workspace reason', () => {
    const plan = classifyChanges({
      changedPaths: ['packages/core/src/entity.ts'],
    });

    expect(plan.testLayerSelectionReasons).toContainEqual({
      changedPath: 'packages/core/src/entity.ts',
      detail: 'direct',
      testLayer: 'test:unit',
      workspaceName: '@church/core',
    });
    expect(plan.testLayerSelectionReasons).toContainEqual({
      changedPath: 'packages/core/src/entity.ts',
      detail: 'dependent-of:@church/core',
      testLayer: 'test:unit',
      workspaceName: 'server',
    });
    expect(plan.testLayerSelectionReasons).toContainEqual({
      changedPath: 'packages/core/src/entity.ts',
      detail: 'dependent-of:@church/core',
      testLayer: 'test:integration',
      workspaceName: 'server',
    });
  });

  it('records a root-infrastructure test-layer reason for every workspace on a root-infra change', () => {
    const plan = classifyChanges({ changedPaths: ['package.json'] });

    expect(plan.testLayerSelectionReasons).toContainEqual({
      changedPath: 'package.json',
      detail: 'root-infrastructure',
      testLayer: 'test:unit',
      workspaceName: '@church/config',
    });
    expect(plan.testLayerSelectionReasons).toContainEqual({
      changedPath: 'package.json',
      detail: 'root-infrastructure',
      testLayer: 'test:integration',
      workspaceName: '@church/config',
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
      e2eSpecPaths: ['tests/scheduling/builder-event-time-block-focus.spec.ts'],
    });

    expect(plan.journeySelectionReasons).toEqual([
      {
        changedPath: null,
        detail: 'explicit',
        specPath: 'tests/scheduling/builder-event-time-block-focus.spec.ts',
      },
    ]);
  });
});

describe('tooling test paths', () => {
  it('selects tooling tests for a change under tooling/', () => {
    const plan = classifyChanges({
      changedPaths: ['tooling/validation/affected.ts'],
    });

    expect(plan.toolingTestPaths).toEqual(['tooling/validation/affected.ts']);
  });

  it('selects tooling tests for a root-infrastructure change', () => {
    const plan = classifyChanges({ changedPaths: ['package.json'] });

    expect(plan.toolingTestPaths).toEqual(['package.json']);
  });

  it('does not select tooling tests for a web-only source change', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/utils/format-volunteer-initials.ts'],
    });

    expect(plan.toolingTestPaths).toEqual([]);
  });

  it('selects tooling tests for a deleted tooling path', () => {
    const plan = classifyChanges({
      changedPaths: ['tooling/validation/affected.ts'],
      deletedPaths: ['tooling/validation/affected.ts'],
    });

    expect(plan.toolingTestPaths).toEqual(['tooling/validation/affected.ts']);
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
    expect(explanation).toContain('Test layers selected:');
    expect(explanation).toContain('  - test:unit');
    expect(explanation).toContain(
      'direct <- apps/web/src/shared/utils/active-church-switch.ts (web)',
    );
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

  it('shows a Tooling tests selected section with the selected paths', () => {
    const plan = classifyChanges({
      changedPaths: ['tooling/validation/affected.ts'],
    });

    const explanation = explainPlan({ baseRef: undefined, plan });

    expect(explanation).toContain('Tooling tests selected:');
    expect(explanation).toContain('tooling/validation/affected.ts');
  });

  it('shows (none) in the Tooling tests selected section when no tooling paths changed', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/src/utils/format-volunteer-initials.ts'],
    });

    const explanation = explainPlan({ baseRef: undefined, plan });

    expect(explanation).toContain('Tooling tests selected:');
    expect(explanation).toContain('(none)');
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

  it('renders a skipped check as "skipped" instead of a zero duration', () => {
    const summary = formatTimingSummary({
      timings: [
        { label: 'lint', ms: 0, skipped: true },
        { label: 'typecheck', ms: 5000 },
      ],
    });

    expect(summary).toBe(
      [
        '| Check | Elapsed |',
        '| --- | --- |',
        '| lint | skipped |',
        '| typecheck | 5.0s |',
      ].join('\n'),
    );
  });
});

describe('server test routing', () => {
  it.each([
    [
      'apps/server/tests/seeds/minimal-church.integration.test.ts',
      'test:integration',
    ],
    [
      'apps/server/tests/seeds/e2e-journey-recipes.contract.integration.test.ts',
      'test:integration',
    ],
    ['apps/server/tests/seeds/reseed-development.unit.test.ts', 'test:unit'],
    ['apps/server/tests/tenancy/provision-church.test.ts', 'test:integration'],
    [
      'apps/server/tests/transfer/volunteer-transfer.constraints.test.ts',
      'test:integration',
    ],
  ])('routes %s to %s', (changedPath, testLayer) => {
    const plan = classifyChanges({ changedPaths: [changedPath] });

    // A seed-subsystem file also brings the aggregate seed contracts along.
    expect(plan.testTargets).toContainEqual({
      testLayer,
      testPath: changedPath.replace('apps/server/', ''),
      workspaceName: 'server',
    });
    expect(plan.testTargets.at(0)).toEqual({
      testLayer,
      testPath: changedPath.replace('apps/server/', ''),
      workspaceName: 'server',
    });
  });
});

describe('deleted paths', () => {
  it('keeps the workspace in scope but runs no test file that no longer exists', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/server/tests/seeds/retired.integration.test.ts'],
      deletedPaths: ['apps/server/tests/seeds/retired.integration.test.ts'],
    });

    expect(plan.workspaceNames).toContain('server');
    expect(plan.testTargets).toEqual([]);
  });

  it('does not fall back to the smoke set for a deleted source file that no journey maps', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/server/src/scripts/seed-dev-users.ts'],
      deletedPaths: ['apps/server/src/scripts/seed-dev-users.ts'],
    });

    expect(plan.workspaceNames).toContain('server');
    expect(plan.missingJourneyMappings).toEqual([]);
    expect(plan.e2eSpecPaths).toEqual([]);
  });

  it('still selects the mapped journeys when a deleted source file is mapped', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/server/src/scripts/provision-church.ts'],
      deletedPaths: ['apps/server/src/scripts/provision-church.ts'],
    });

    expect(plan.e2eSpecPaths.length).toBeGreaterThan(0);
    expect(plan.missingJourneyMappings).toEqual([]);
  });

  it('still reports an unmapped source file that was not deleted', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/server/src/scripts/seed-dev-users.ts'],
      deletedPaths: [],
    });

    expect(plan.missingJourneyMappings).toEqual([
      'apps/server/src/scripts/seed-dev-users.ts',
    ]);
  });
});

describe('seed impact', () => {
  it.each([
    ['schema', 'packages/db/src/schema/volunteer.ts'],
    ['schema', 'packages/db/src/migrations/0099_next.sql'],
    [
      'persistence',
      'apps/server/src/infrastructure/repositories/assignment-repository.ts',
    ],
    ['persistence', 'apps/server/src/domain/entities/assignment.ts'],
    ['authentication', 'packages/auth/src/index.ts'],
    ['authentication', 'apps/server/src/infrastructure/auth/session.ts'],
    ['tenancy', 'packages/db/src/tenancy.ts'],
    ['tenancy', 'apps/server/src/scripts/provision-church.ts'],
    ['tenancy', 'apps/server/src/application/db-authority-manager.ts'],
    ['scheduling', 'apps/server/src/application/db-cycle-manager.ts'],
    ['scheduling', 'apps/server/src/domain/assignment/types.ts'],
    [
      'scheduling',
      'apps/server/src/application/db-volunteer-transfer-manager.ts',
    ],
    ['scheduling', 'apps/server/src/application/db-redemption-manager.ts'],
    [
      'scheduling',
      'apps/server/src/application/db-ministry-invitation-manager.ts',
    ],
    ['scheduling', 'apps/server/src/application/db-event-future-manager.ts'],
    ['scheduling', 'apps/server/src/domain/services/shift-splitter.ts'],
    ['schema', 'packages/db/src/index.ts'],
    ['schema', 'packages/db/src/client.ts'],
    ['schema', 'packages/db/src/schemas/system-initialization.ts'],
  ])('treats a %s change (%s) as seed-relevant that needs a decision', (area, changedPath) => {
    const plan = classifyChanges({ changedPaths: [changedPath] });

    expect(plan.seedImpact.changes).toEqual([{ area, changedPath }]);
    expect(plan.seedImpact.contractsSelected).toBe(true);
    expect(plan.seedImpact.decision).toBe('undecided');
    expect(
      plan.testLayerSelectionReasons.some(
        (reason) =>
          reason.detail === `seed-contract:${area}` &&
          reason.changedPath === changedPath &&
          reason.testLayer === 'test:integration',
      ),
    ).toBe(true);
  });

  it('ignores tests, docs and unrelated source', () => {
    const plan = classifyChanges({
      changedPaths: [
        'packages/db/tests/schema/some.test.ts',
        'apps/server/src/application/db-outbox-drainer.ts',
        'apps/web/src/routes/dashboard.tsx',
        'docs/agents/backend.md',
      ],
    });

    expect(plan.seedImpact).toEqual({
      acknowledgements: [],
      changes: [],
      contractsSelected: false,
      decision: 'not-applicable',
    });
  });

  it('runs the whole server layer, seed contracts included, beside a changed test file', () => {
    const plan = classifyChanges({
      changedPaths: [
        'packages/db/src/schema/volunteer.ts',
        'apps/server/tests/application/scheduling-phase6.assign.test.ts',
      ],
    });

    expect(plan.testTargets).toEqual([]);
    expect(plan.seedImpact.contractsSelected).toBe(true);
  });

  it('adds no target when the workspace already runs its whole layer', () => {
    const plan = classifyChanges({
      changedPaths: ['packages/db/src/schema/volunteer.ts'],
    });

    expect(plan.testTargets).toEqual([]);
  });

  it('is decided by updating the seed subsystem in the same change', () => {
    const plan = classifyChanges({
      changedPaths: [
        'packages/db/src/schema/volunteer.ts',
        'apps/server/seeds/builders/volunteer.ts',
      ],
    });

    expect(plan.seedImpact.decision).toBe('seed-updated');
  });

  it('is decided by an explicit no-seed-impact acknowledgement', () => {
    const plan = classifyChanges({
      changedPaths: ['packages/db/src/schema/volunteer.ts'],
      seedImpactAcknowledgements: ['adds an index only'],
    });

    expect(plan.seedImpact.decision).toBe('acknowledged');
    expect(plan.seedImpact.acknowledgements).toEqual(['adds an index only']);
    expect(plan.seedImpact.contractsSelected).toBe(true);
  });

  it('never accepts a blank acknowledgement', () => {
    const plan = classifyChanges({
      changedPaths: ['packages/db/src/schema/volunteer.ts'],
      seedImpactAcknowledgements: ['   ', ''],
    });

    expect(plan.seedImpact.decision).toBe('undecided');
  });

  it('selects the contracts for a seed subsystem change without needing a decision', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/server/tests/seeds/minimal-church.integration.test.ts',
      ],
    });

    expect(plan.seedImpact.contractsSelected).toBe(true);
    expect(plan.seedImpact.decision).toBe('seed-updated');
  });
});

describe('seed impact acknowledgement input', () => {
  it('reads --no-seed-impact as a reason', () => {
    expect(
      parseArguments({ args: ['--no-seed-impact', 'index only'] })
        .seedImpactAcknowledgements,
    ).toEqual(['index only']);
  });

  it('requires a reason', () => {
    expect(() => parseArguments({ args: ['--no-seed-impact'] })).toThrow(
      '--no-seed-impact requires a reason.',
    );
  });

  it('reads Seed-Impact: none trailers from commit messages', () => {
    expect(
      readSeedImpactTrailers({
        messages: [
          'feat(db): add column\n\nbody\n\nSeed-Impact: none - nullable audit column\n',
          'fix: other\n',
          'x\n\nseed-impact: none -  \n',
        ],
      }),
    ).toEqual(['nullable audit column']);
  });
});

describe('explainPlan seed impact', () => {
  it('states the missing decision and how to make it', () => {
    const plan = classifyChanges({
      changedPaths: ['packages/db/src/schema/volunteer.ts'],
    });

    const text = explainPlan({ baseRef: undefined, plan });

    expect(text).toContain('Seed impact: decision required');
    expect(text).toContain('packages/db/src/schema/volunteer.ts');
    expect(text).toContain('Seed-Impact: none');
  });
});

describe('init-system journey mapping', () => {
  it('selects the journey recipe specs, like the other provisioning scripts', () => {
    const initSystem = classifyChanges({
      changedPaths: ['apps/server/src/scripts/init-system.ts'],
    });
    const provision = classifyChanges({
      changedPaths: ['apps/server/src/scripts/provision-church.ts'],
    });

    expect(initSystem.missingJourneyMappings).toEqual([]);
    expect(initSystem.e2eSpecPaths).toEqual(provision.e2eSpecPaths);
    expect(initSystem.e2eSpecPaths.length).toBeGreaterThan(0);
  });
});

describe('classifyChanges test narrowing', () => {
  const webTest = 'apps/web/tests/components/foo.component.test.tsx';
  const webTargets = (plan: ReturnType<typeof classifyChanges>) =>
    plan.testTargets.filter(({ workspaceName }) => workspaceName === 'web');

  it('runs the whole web layer when a dependency source changes with a web test', () => {
    const plan = classifyChanges({
      changedPaths: ['packages/time/src/display.ts', webTest],
    });

    expect(webTargets(plan)).toEqual([]);
  });

  it('runs the whole web layer when web source changes with a web test', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/web/src/utils/format-volunteer-initials.ts',
        webTest,
      ],
    });

    expect(webTargets(plan)).toEqual([]);
  });

  it('keeps web narrowed to the changed files when only web tests changed', () => {
    const plan = classifyChanges({ changedPaths: [webTest] });

    expect(webTargets(plan)).toEqual([
      {
        testLayer: 'test:unit',
        testPath: 'tests/components/foo.component.test.tsx',
        workspaceName: 'web',
      },
    ]);
  });

  it('runs the whole web layer when a test helper changes with a web test', () => {
    const plan = classifyChanges({
      changedPaths: ['apps/web/tests/helpers/render.tsx', webTest],
    });

    expect(webTargets(plan)).toEqual([]);
  });

  it('narrows server but runs web whole for a server test plus web source', () => {
    const plan = classifyChanges({
      changedPaths: [
        'apps/server/tests/application/foo.test.ts',
        'apps/web/src/utils/format-volunteer-initials.ts',
      ],
    });

    expect(plan.testTargets.map(({ workspaceName }) => workspaceName)).toEqual([
      'server',
    ]);
  });
});

describe('package.json scripts-only addition', () => {
  const base = JSON.stringify({
    dependencies: { a: '1' },
    scripts: { build: 'x', test: 'y' },
  });
  const withHead = (head: object) =>
    isScriptsOnlyAddition({ base, head: JSON.stringify(head) });

  it('accepts new scripts and nothing else', () => {
    expect(
      withHead({
        dependencies: { a: '1' },
        scripts: { build: 'x', test: 'y', guard: 'z' },
      }),
    ).toBe(true);
  });

  it('rejects an edited or removed script', () => {
    expect(
      withHead({
        dependencies: { a: '1' },
        scripts: { build: 'x', test: 'z' },
      }),
    ).toBe(false);
    expect(
      withHead({ dependencies: { a: '1' }, scripts: { build: 'x' } }),
    ).toBe(false);
  });

  it('rejects a dependency change, and unparsable content', () => {
    expect(
      withHead({
        dependencies: { a: '2' },
        scripts: { build: 'x', test: 'y' },
      }),
    ).toBe(false);
    expect(isScriptsOnlyAddition({ base: '', head: base })).toBe(false);
  });

  it('selects no workspace layers but keeps tooling tests for a scripts-only addition', () => {
    const plan = classifyChanges({
      changedPaths: ['package.json'],
      packageJsonScriptsOnlyAddition: true,
    });

    expect(plan.workspaceNames).toEqual([]);
    expect(plan.testLayers).toEqual([]);
    expect(plan.toolingTestPaths).toEqual(['package.json']);
  });

  it('keeps the full workspace selection for any other package.json change', () => {
    const plan = classifyChanges({ changedPaths: ['package.json'] });

    expect(plan.workspaceNames).toContain('server');
    expect(plan.testLayers).toEqual(['test:unit', 'test:integration']);
  });
});
