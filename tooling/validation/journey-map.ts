export interface JourneyMapping {
  specPaths: string[];
  sourcePathPrefix: string;
}

// The initial critical smoke set (#210): identity redemption, active-Church
// isolation, planning builder, Availability, and roster publishing. Runs
// whenever a production web or server change has no entry in JOURNEY_MAP
// below, so missing metadata degrades to "run everything critical" instead
// of silently losing coverage.
export const CRITICAL_SMOKE_SPEC_PATHS: string[] = [
  'tests/identity/redemption-new-user.spec.ts',
  'tests/identity/redemption-existing-member.spec.ts',
  'tests/identity/active-church-switching.spec.ts',
  'tests/scheduling/smoke.spec.ts',
  'tests/scheduling/us3-volunteer-availability.spec.ts',
  'tests/scheduling/us4-roster-publish.spec.ts',
];

const REDEMPTION_SPEC_PATHS = [
  'tests/identity/redemption-new-user.spec.ts',
  'tests/identity/redemption-existing-member.spec.ts',
];

const VOLUNTEER_TRANSFER_SPEC_PATHS = [
  'tests/identity/volunteer-transfer-journey.spec.ts',
];

// #216 — the dashboard shell and its shared hooks/lib feed all three of the
// Availability, Assignment, and Ministry Schedule sections at once, so a
// change there is verified by all three specs together. #218 — the same
// shell and hooks (use-online-state, use-dashboard-refresh,
// dashboard-query-options' cached-snapshot reads) also drive the offline
// experience proven by us5-offline, so it joins this shared group.
const VOLUNTEER_DASHBOARD_SPEC_PATHS = [
  'tests/volunteer-dashboard/us1-availability.spec.ts',
  'tests/volunteer-dashboard/us2-assignments.spec.ts',
  'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
  'tests/volunteer-dashboard/us5-offline.spec.ts',
];

// #218 — the notification bell (header) and the /notifications inbox page
// are proven end to end by this one spec, the only one that drives the
// bell's dropdown, its deep links, and the full inbox page.
const NOTIFICATION_BELL_SPEC_PATHS = [
  'tests/volunteer-dashboard/us-notification-bell.spec.ts',
];

// #217 — Church isolation on the planning-cycles list and $cycleId route,
// the two lock edge cases (network failure, double-submit), and the
// Church-local-time create-event journey all load through the same
// planning-cycles route, feature components, and generated API client.
const PLANNING_CYCLE_EDGE_SPEC_PATHS = [
  'tests/scheduling/cross-cutting.spec.ts',
  'tests/scheduling/planning-cross-tenant-isolation.spec.ts',
  'tests/scheduling/single-create-event-ui.spec.ts',
];

// Sourced from verified route-to-spec coupling (e.g. a spec's page.goto
// target matches the route file's path). Each entry here is a mapped hit;
// every production web/server path that matches none of them falls back to
// CRITICAL_SMOKE_SPEC_PATHS. Sub-issues #213-#219 classify the remaining
// journeys and extend this map; under-mapping is safe (it just widens the
// fallback), so entries are added only once verified against a real spec.
export const JOURNEY_MAP: JourneyMapping[] = [
  {
    sourcePathPrefix: 'apps/web/src/routes/invitations/',
    specPaths: REDEMPTION_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/web/src/routes/_authenticated/invitations/',
    specPaths: REDEMPTION_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/web/src/infrastructure/api/redemption.ts',
    specPaths: REDEMPTION_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/web/src/routes/_authenticated/_active-church.tsx',
    specPaths: [
      'tests/identity/active-church-switching.spec.ts',
      'tests/identity/cross-tenant-invitation-isolation.spec.ts',
    ],
  },
  {
    sourcePathPrefix: 'apps/web/src/shared/utils/active-church-switch.ts',
    specPaths: ['tests/identity/active-church-switching.spec.ts'],
  },
  {
    // #217 — the scheduling capability index (the `/scheduling` landing
    // route) is a distinct route from the three named below; its guard and
    // capability specs load routes under this whole family, so they belong
    // at this broad prefix rather than one of the narrower ones.
    // a11y-builder.spec.ts and a11y-planning-nav.spec.ts (below) are
    // deliberately NOT classified here — #217's own scope is "authorization,
    // Church isolation, time, and edge-case coverage"; accessibility
    // coverage is #219's ("Right-size web-shell coverage") to classify,
    // including whether it needs new lower-layer a11y tooling.
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/_active-church/scheduling',
    specPaths: [
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us4-roster-publish.spec.ts',
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
      'tests/scheduling/capability-index.spec.ts',
    ],
  },
  {
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/_active-church/volunteer',
    specPaths: ['tests/scheduling/us3-volunteer-availability.spec.ts'],
  },
  {
    sourcePathPrefix: 'apps/web/src/features/scheduling/',
    specPaths: [
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us3-volunteer-availability.spec.ts',
      'tests/scheduling/us4-roster-publish.spec.ts',
      // #217 — right-sized: qualification/eligibility guard, the one
      // remaining boundary-crossing focus-rail assignment, and the
      // cross-route denial matrix all render through this feature's
      // components.
      'tests/scheduling/qualification.spec.ts',
      'tests/scheduling/builder-slot-focus.spec.ts',
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
    ],
  },
  {
    // PlanningCycle admin journey (#215): create cycle, build/apply the
    // template library (including the overnight-block span rule), add
    // manual events, resolve overlap, lock, navigate cycle/template/new
    // URLs, and review the calendar table — proven end to end by these four
    // specs, the only ones that exercise the planning-cycles routes and
    // planning-admin feature components. The generic prefixes above only
    // select smoke/us4, which never touch this dialog-driven flow.
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/_active-church/scheduling/planning-cycles',
    specPaths: [
      'tests/scheduling/overnight-time-block.spec.ts',
      'tests/scheduling/planning-cycles-table-view.spec.ts',
      'tests/scheduling/planning-nav-restructure.spec.ts',
      'tests/scheduling/us1-admin-plan.spec.ts',
      // #217 — right-sized: Church isolation on the list and the $cycleId
      // route, the two lock edge cases (network failure, double-submit), the
      // Church-local-time create-event journey, and the cross-route guard
      // matrix's ChurchAdmin-facing route all load through this route
      // family. Accessibility (a11y-planning-nav.spec.ts) is out of #217's
      // scope — see the comment on the broad scheduling prefix above.
      ...PLANNING_CYCLE_EDGE_SPEC_PATHS,
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
    ],
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/scheduling/components/planning-admin/',
    specPaths: [
      'tests/scheduling/overnight-time-block.spec.ts',
      'tests/scheduling/planning-cycles-table-view.spec.ts',
      'tests/scheduling/planning-nav-restructure.spec.ts',
      'tests/scheduling/us1-admin-plan.spec.ts',
      ...PLANNING_CYCLE_EDGE_SPEC_PATHS,
    ],
  },
  {
    // Leader-tailoring journey (#215): tailoring participation, split
    // shifts, headcounts, and firing Availability — proven end to end by
    // us2-leader-tailor.spec.ts, the only spec that drives the tailoring
    // routes, feature components, and its dedicated API client.
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/_active-church/scheduling/tailoring',
    specPaths: [
      'tests/scheduling/us2-leader-tailor.spec.ts',
      // #217 — the matrix's Volunteer-denial case and the merged-in Leader
      // positive control both load this bare index route directly.
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
    ],
  },
  {
    sourcePathPrefix: 'apps/web/src/features/scheduling/components/tailoring/',
    specPaths: ['tests/scheduling/us2-leader-tailor.spec.ts'],
  },
  {
    sourcePathPrefix: 'apps/web/src/infrastructure/api/tailoring.ts',
    specPaths: ['tests/scheduling/us2-leader-tailor.spec.ts'],
  },
  {
    // Generated client shared by both the planning-admin (cycle/template/
    // event CRUD) and tailoring (serving-profile, default-direction)
    // endpoints — verified by grepping both endpoint families into this one
    // file.
    sourcePathPrefix: 'apps/web/src/infrastructure/api/planning.ts',
    specPaths: [
      'tests/scheduling/overnight-time-block.spec.ts',
      'tests/scheduling/planning-cycles-table-view.spec.ts',
      'tests/scheduling/planning-nav-restructure.spec.ts',
      'tests/scheduling/us1-admin-plan.spec.ts',
      'tests/scheduling/us2-leader-tailor.spec.ts',
      ...PLANNING_CYCLE_EDGE_SPEC_PATHS,
    ],
  },
  // #214 — Church isolation (Ministry Invitation minting/resend) proven by
  // cross-tenant-invitation-isolation.spec.ts, coupled to the admin surface
  // that mints/resends invitations and the manager whose ensureMintableScope
  // returns the indistinguishable not-found (#68).
  {
    sourcePathPrefix: 'apps/server/src/api/controllers/ministry-controller.ts',
    specPaths: ['tests/identity/cross-tenant-invitation-isolation.spec.ts'],
  },
  {
    sourcePathPrefix:
      'apps/server/src/application/db-ministry-invitation-manager.ts',
    specPaths: ['tests/identity/cross-tenant-invitation-isolation.spec.ts'],
  },
  // #214 — route protection and deep-link return (#66), coupled to the
  // authenticated guard, the sign-in route's redirect-away and landing
  // redirect. validateInternalReturnTarget's open-redirect rejection has its
  // own unit test and is deliberately not re-proven at this layer, but this
  // file still drives the redirect target the spec asserts on.
  {
    sourcePathPrefix: 'apps/web/src/routes/_authenticated.tsx',
    specPaths: ['tests/identity/route-protection.spec.ts'],
  },
  {
    sourcePathPrefix: 'apps/web/src/routes/login.tsx',
    specPaths: ['tests/identity/route-protection.spec.ts'],
  },
  {
    sourcePathPrefix: 'apps/web/src/shared/utils/return-target.ts',
    specPaths: ['tests/identity/route-protection.spec.ts'],
  },
  {
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/_active-church/index.tsx',
    specPaths: ['tests/identity/route-protection.spec.ts'],
  },
  // #214 — Volunteer Transfer (#65): the split screen and its three
  // confirmation layers live in the ministry-invitation route and the
  // volunteer-transfer feature; the server side is the redemption
  // controller's transfer preview/confirm endpoints (which also serve plain
  // redemption, hence both spec sets) and the transfer manager.
  {
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/invitations/ministry/',
    specPaths: VOLUNTEER_TRANSFER_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/web/src/features/volunteer-transfer/',
    specPaths: VOLUNTEER_TRANSFER_SPEC_PATHS,
  },
  {
    sourcePathPrefix:
      'apps/server/src/api/controllers/redemption-controller.ts',
    specPaths: [...REDEMPTION_SPEC_PATHS, ...VOLUNTEER_TRANSFER_SPEC_PATHS],
  },
  {
    sourcePathPrefix:
      'apps/server/src/application/db-volunteer-transfer-manager.ts',
    specPaths: VOLUNTEER_TRANSFER_SPEC_PATHS,
  },
  // #216 — Volunteer dashboard Availability and Assignment journeys: the
  // "Availability needed" task/editor and the "I cannot serve" assignment
  // response, proven end to end by these two specs, the only ones that drive
  // the dashboard route's availability/assignments sections.
  {
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/_active-church/dashboard.tsx',
    specPaths: VOLUNTEER_DASHBOARD_SPEC_PATHS,
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/components/volunteer-dashboard.tsx',
    specPaths: VOLUNTEER_DASHBOARD_SPEC_PATHS,
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/hooks/use-volunteer-dashboard.ts',
    specPaths: VOLUNTEER_DASHBOARD_SPEC_PATHS,
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/hooks/use-dashboard-refresh.ts',
    specPaths: VOLUNTEER_DASHBOARD_SPEC_PATHS,
  },
  {
    // #218 — also owns the cached notification-inbox reads/writes that back
    // use-notification-inbox's offline fallback.
    sourcePathPrefix:
      'apps/web/src/features/volunteers/lib/dashboard-query-options.ts',
    specPaths: [
      ...VOLUNTEER_DASHBOARD_SPEC_PATHS,
      ...NOTIFICATION_BELL_SPEC_PATHS,
    ],
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/lib/dashboard-mappers.ts',
    specPaths: VOLUNTEER_DASHBOARD_SPEC_PATHS,
  },
  {
    // #218 — shared by every dashboard hook (use-volunteer-dashboard,
    // use-dashboard-refresh) and by use-notification-inbox, so a change here
    // is verified by both the offline and notification-bell journeys.
    sourcePathPrefix:
      'apps/web/src/features/volunteers/hooks/use-online-state.ts',
    specPaths: [
      ...VOLUNTEER_DASHBOARD_SPEC_PATHS,
      ...NOTIFICATION_BELL_SPEC_PATHS,
    ],
  },
  {
    // #218 — the offline/last-known-data alert rendered only from the
    // dashboard shell.
    sourcePathPrefix:
      'apps/web/src/features/volunteers/components/dashboard-offline-banner.tsx',
    specPaths: ['tests/volunteer-dashboard/us5-offline.spec.ts'],
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/components/availability-needed-section.tsx',
    specPaths: ['tests/volunteer-dashboard/us1-availability.spec.ts'],
  },
  {
    // #218 — also renders the offline-disabled Save/edit affordances
    // us5-offline asserts on.
    sourcePathPrefix:
      'apps/web/src/features/volunteers/components/availability-form.tsx',
    specPaths: [
      'tests/volunteer-dashboard/us1-availability.spec.ts',
      'tests/volunteer-dashboard/us5-offline.spec.ts',
    ],
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/components/upcoming-assignments-section.tsx',
    specPaths: [
      'tests/volunteer-dashboard/us2-assignments.spec.ts',
      // #217 — the volunteer-side confirm/cancel affordance us5-live-changes
      // drives to prove the leader-notify and cross-volunteer-denial edges.
      'tests/scheduling/us5-live-changes.spec.ts',
    ],
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/lib/assignment-grouping.ts',
    specPaths: ['tests/volunteer-dashboard/us2-assignments.spec.ts'],
  },
  // #216 — published-schedule visibility: the ministry-schedule dashboard
  // section is exercised directly by us4-ministry-schedule, and reused by
  // us4-roster-publish to assert a volunteer sees a just-published shift.
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/components/ministry-schedule-section.tsx',
    specPaths: [
      'tests/scheduling/us4-roster-publish.spec.ts',
      'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
    ],
  },
  // #216 — the volunteer-facing generated API client backs the dashboard
  // (Availability/Assignment/ministry-schedule), the availability-check
  // journey (#210's initial smoke set), and roster-publish's volunteer-side
  // assertion; verified by grepping each endpoint's only caller. #218 — it
  // also serves the /notifications, /notifications/:id, and
  // /notifications/read-all endpoints the bell and inbox call.
  {
    sourcePathPrefix: 'apps/web/src/infrastructure/api/volunteer.ts',
    specPaths: [
      ...VOLUNTEER_DASHBOARD_SPEC_PATHS,
      ...NOTIFICATION_BELL_SPEC_PATHS,
      'tests/scheduling/us3-volunteer-availability.spec.ts',
      'tests/scheduling/us4-roster-publish.spec.ts',
    ],
  },
  // #218 — the notification bell (header, every page) and the /notifications
  // inbox page, proven end to end by this one spec.
  {
    sourcePathPrefix:
      'apps/web/src/components/notification-bell/notification-bell.tsx',
    specPaths: NOTIFICATION_BELL_SPEC_PATHS,
  },
  {
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/_active-church/notifications.tsx',
    specPaths: NOTIFICATION_BELL_SPEC_PATHS,
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/components/notifications-inbox-section.tsx',
    specPaths: NOTIFICATION_BELL_SPEC_PATHS,
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/hooks/use-notification-inbox.ts',
    specPaths: NOTIFICATION_BELL_SPEC_PATHS,
  },
  {
    // Drives the deep-link the spec asserts on when clicking a notification.
    sourcePathPrefix:
      'apps/web/src/features/volunteers/lib/notification-navigation.ts',
    specPaths: NOTIFICATION_BELL_SPEC_PATHS,
  },
  // #216 — the rostering (assignment/publish) generated API client backs the
  // cycle-builder used at the rostering route; already the exact spec pair
  // the critical-smoke fallback would run, made explicit rather than
  // incidental.
  {
    sourcePathPrefix: 'apps/web/src/infrastructure/api/rostering.ts',
    specPaths: [
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us4-roster-publish.spec.ts',
      // #217 — team-scoped assignment/removal (qualification), the focused
      // pick-me commit (builder-slot-focus), and the volunteer-notify/leader-
      // reassign flow (us5-live-changes) all call this client's assignment
      // endpoints.
      'tests/scheduling/qualification.spec.ts',
      'tests/scheduling/builder-slot-focus.spec.ts',
      'tests/scheduling/us5-live-changes.spec.ts',
    ],
  },
  // #217 — the church-admin-controller owns every planning-cycle and event
  // endpoint these specs drive: list/detail isolation and the lock edge
  // cases (cross-cutting, DL4-X1/X2/X3), the $cycleId isolation route
  // (planning-cross-tenant-isolation), and quick-create's Church-local
  // Instant (single-create-event-ui).
  {
    sourcePathPrefix:
      'apps/server/src/api/controllers/church-admin-controller.ts',
    specPaths: PLANNING_CYCLE_EDGE_SPEC_PATHS,
  },
  // #217 — the rostering controller owns shift assignment, unassignment, and
  // reassignment: qualification's team-boundary 403, builder-slot-focus's
  // focused commit, and us5-live-changes's mid-cycle reassign.
  {
    sourcePathPrefix: 'apps/server/src/api/controllers/rostering-controller.ts',
    specPaths: [
      'tests/scheduling/qualification.spec.ts',
      'tests/scheduling/builder-slot-focus.spec.ts',
      'tests/scheduling/us5-live-changes.spec.ts',
    ],
  },
  // #217 — the volunteer controller's own-assignment cancel endpoint is what
  // proves a different volunteer gets a 403, not just a UI affordance. #218 —
  // it also owns the /notifications list, read, and read-all endpoints the
  // bell and inbox call.
  {
    sourcePathPrefix: 'apps/server/src/api/controllers/volunteer-controller.ts',
    specPaths: [
      'tests/scheduling/us5-live-changes.spec.ts',
      ...NOTIFICATION_BELL_SPEC_PATHS,
    ],
  },
];
