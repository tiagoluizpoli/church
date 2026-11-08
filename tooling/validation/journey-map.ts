export interface JourneyMapping {
  specPaths: string[];
  sourcePathPrefix: string;
}

// #219 ("Right-size web-shell coverage") classified desktop-layout,
// mobile-layout, home-landing, search, theme, and timezone against the
// critical-journey criterion: each crossed at most one of
// browser/API/database/authentication/real-time (pure client UI, routing, or
// theme state, no server/API/DB boundary). None qualified as critical, so
// all six were deleted and their coverage moved to component tests
// (app-shell.component.test.tsx, command-palette.component.test.tsx,
// mode-toggle.component.test.tsx, user-menu.component.test.tsx, and the
// volunteer-dashboard/`_active-church` index route tests) — no new entries
// were added to JOURNEY_MAP for them. a11y-builder.spec.ts and
// a11y-planning-nav.spec.ts were also #219's to classify; both stayed at
// this layer (see their entries below) because axe-core's WCAG scan needs
// real browser paint that a jsdom component test cannot reproduce.

// The initial critical smoke set (#210): identity redemption, active-Church
// isolation, planning builder, Availability, and schedule publishing. Runs
// whenever a production web or server change has no entry in JOURNEY_MAP
// below, so missing metadata degrades to "run everything critical" instead
// of silently losing coverage.
export const CRITICAL_SMOKE_SPEC_PATHS: string[] = [
  'tests/identity/redemption-new-user.spec.ts',
  'tests/identity/redemption-existing-member.spec.ts',
  'tests/identity/active-church-switching.spec.ts',
  'tests/scheduling/smoke.spec.ts',
  'tests/scheduling/us3-volunteer-availability.spec.ts',
  'tests/scheduling/us4-schedule-publish.spec.ts',
];

const REDEMPTION_SPEC_PATHS = [
  'tests/identity/redemption-new-user.spec.ts',
  'tests/identity/redemption-existing-member.spec.ts',
];

// The public Church Invitation join also serves the plain first-admin
// invitation (J0→J1); the authenticated Ministry route does not.
const INVITATION_JOURNEY_SPEC_PATHS = [
  'tests/identity/invitation-journey.spec.ts',
];

// J2 (#682): People directory and member detail, the Ministry Role edit and
// the Church access change it consumes from People A.
const PEOPLE_JOURNEY_SPEC_PATHS = ['tests/people/people-journey.spec.ts'];

const CHURCH_INVITATION_SPEC_PATHS = [
  'tests/identity/first-admin-onboarding.spec.ts',
  ...INVITATION_JOURNEY_SPEC_PATHS,
  ...REDEMPTION_SPEC_PATHS,
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
  'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
  'tests/volunteer-dashboard/us5-offline.spec.ts',
];

// #218 — the notification bell (header) and the /notifications inbox page
// are proven end to end by this one spec, the only one that drives the
// bell's dropdown, its deep links, and the full inbox page.
const NOTIFICATION_BELL_SPEC_PATHS = [
  'tests/volunteer-dashboard/us-notification-bell.spec.ts',
];

// J5 (#717): the planning journey owns the actual ChurchAdmin-to-leader
// handoff: Event graph work in the browser, Send through the outbox, then N2
// from a distinct leader's bell to Prepare. Other permutations stay at their
// HTTP, component and outbox seams.
const CYCLE_HANDOFF_SPEC_PATHS = ['tests/scheduling/us1-admin-plan.spec.ts'];

// J6 (#744): Prepare a Time block, Ask with a Deadline, inspect pending
// Answers and Remind into the persisted cooldown through the real API/DB.
const LEADER_AVAILABILITY_SPEC_PATHS = [
  'tests/scheduling/j6-leader-availability.spec.ts',
];

// J7 (#754): a Volunteer answers independent Ministry checks.
const VOLUNTEER_AVAILABILITY_SPEC_PATHS = [
  'tests/scheduling/us3-volunteer-availability.spec.ts',
];

// Specs whose starting graph comes from a server E2E recipe (#327): their
// own journey recipe, or the shared personas global setup loads (#330).
const JOURNEY_RECIPE_SPEC_PATHS = [
  'tests/identity/active-church-switching.spec.ts',
  'tests/identity/cross-tenant-invitation-isolation.spec.ts',
  'tests/identity/first-admin-onboarding.spec.ts',
  'tests/identity/invitation-journey.spec.ts',
  'tests/identity/redemption-existing-member.spec.ts',
  'tests/identity/redemption-new-user.spec.ts',
  // Signs in as the shared personas global setup loads from a recipe.
  'tests/identity/route-protection.spec.ts',
  'tests/identity/volunteer-transfer-journey.spec.ts',
  ...PEOPLE_JOURNEY_SPEC_PATHS,
  'tests/scheduling/a11y-builder.spec.ts',
  'tests/scheduling/a11y-planning-nav.spec.ts',
  'tests/scheduling/builder-event-time-block-focus.spec.ts',
  'tests/scheduling/capability-index.spec.ts',
  'tests/scheduling/cross-cutting.spec.ts',
  'tests/scheduling/event-templates.spec.ts',
  'tests/scheduling/planning-cross-tenant-isolation.spec.ts',
  'tests/scheduling/cycles-table-view.spec.ts',
  'tests/scheduling/planning-nav-restructure.spec.ts',
  'tests/scheduling/planning-role-guard-matrix.spec.ts',
  'tests/scheduling/qualification.spec.ts',
  'tests/scheduling/single-create-event-ui.spec.ts',
  'tests/scheduling/smoke.spec.ts',
  'tests/scheduling/us1-admin-plan.spec.ts',
  'tests/scheduling/us2-leader-prepare.spec.ts',
  ...LEADER_AVAILABILITY_SPEC_PATHS,
  ...VOLUNTEER_AVAILABILITY_SPEC_PATHS,
  'tests/scheduling/us4-schedule-publish.spec.ts',
  'tests/scheduling/us5-leader-reassign.spec.ts',
  'tests/volunteer-dashboard/us-notification-bell.spec.ts',
  'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
  'tests/volunteer-dashboard/us5-offline.spec.ts',
];

// #217 — Church isolation on the cycles list and $cycleId route,
// the two lock edge cases (network failure, double-submit), and the
// Church-local-time create-event journey all load through the same
// cycles route, feature components, and generated API client.
const CYCLE_EDGE_SPEC_PATHS = [
  'tests/scheduling/cross-cutting.spec.ts',
  'tests/scheduling/planning-cross-tenant-isolation.spec.ts',
  'tests/scheduling/single-create-event-ui.spec.ts',
];

// #289 — verified via each spec's page.goto target. smoke.spec.ts navigates
// both the assign builder and the prepare route; qualification.spec.ts
// and builder-event-time-block-focus.spec.ts navigate only the assign builder;
// us4-schedule-publish.spec.ts navigates only the prepare route;
// planning-role-guard-matrix.spec.ts navigates all three scheduling routes
// (cycles, prepare, and the assign builder — asserting
// directly on the builder's `cycle-builder` testid), so it belongs in all
// three journeys' maps. None of these navigate the availability pages, so
// that journey stays out.
const PLANNING_ADMIN_SPEC_PATHS = [
  'tests/scheduling/event-templates.spec.ts',
  'tests/scheduling/cycles-table-view.spec.ts',
  'tests/scheduling/planning-nav-restructure.spec.ts',
  'tests/scheduling/planning-role-guard-matrix.spec.ts',
  'tests/scheduling/us1-admin-plan.spec.ts',
  ...CYCLE_EDGE_SPEC_PATHS,
];

const PREPARE_SPEC_PATHS = [
  'tests/scheduling/planning-role-guard-matrix.spec.ts',
  'tests/scheduling/smoke.spec.ts',
  'tests/scheduling/us2-leader-prepare.spec.ts',
  'tests/scheduling/us4-schedule-publish.spec.ts',
];

const BUILDER_SPEC_PATHS = [
  'tests/scheduling/a11y-builder.spec.ts',
  'tests/scheduling/builder-event-time-block-focus.spec.ts',
  'tests/scheduling/planning-role-guard-matrix.spec.ts',
  'tests/scheduling/qualification.spec.ts',
  'tests/scheduling/smoke.spec.ts',
];

// Sourced from verified route-to-spec coupling (e.g. a spec's page.goto
// target matches the route file's path). Each entry here is a mapped hit;
// every production web/server path that matches none of them falls back to
// CRITICAL_SMOKE_SPEC_PATHS. Sub-issues #213-#219 classify the remaining
// journeys and extend this map; under-mapping is safe (it just widens the
// fallback), so entries are added only once verified against a real spec.
const PREPARE_ROUTE_FILES = [
  'schedules.tsx',
  'schedules/index.tsx',
  'schedules/$ministryId/$cycleId/index.tsx',
].map((f) => `apps/web/src/routes/_authenticated/_active-church/${f}`);

export const JOURNEY_MAP: JourneyMapping[] = [
  ...[
    'apps/web/src/routes/_authenticated/_active-church/availability.tsx',
    'apps/web/src/routes/_authenticated/_active-church/availability_.$checkId.tsx',
    'apps/web/src/features/volunteers/components/availability-list-page.tsx',
    'apps/web/src/features/volunteers/components/availability-detail-page.tsx',
    'apps/web/src/features/volunteers/hooks/use-availability-check-breadcrumb.ts',
    'apps/web/src/features/volunteers/hooks/use-local-availability-draft.ts',
    'apps/web/src/features/volunteers/lib/unavailable-shifts.ts',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: VOLUNTEER_AVAILABILITY_SPEC_PATHS,
  })),
  ...[
    'apps/web/src/routes/_authenticated/_active-church/schedules/$ministryId/$cycleId/index.tsx',
    'apps/web/src/routes/_authenticated/_active-church/schedules/$ministryId/$cycleId/slots/$timeSlotId.tsx',
    'apps/web/src/features/scheduling/components/prepare/schedule-ask.tsx',
    'apps/web/src/features/scheduling/components/availability-status-section.tsx',
    'apps/web/src/infrastructure/api/prepare.ts',
    'apps/server/src/api/controllers/prepare-controller.ts',
    'apps/server/src/api/dtos/participation.dto.ts',
    'apps/server/src/application/db-availability-check-manager.ts',
    'apps/server/src/infrastructure/repositories/drizzle-availability-check.repository.ts',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: LEADER_AVAILABILITY_SPEC_PATHS,
  })),
  ...[
    'apps/web/src/features/people/',
    'apps/web/src/routes/_authenticated/_active-church/people',
    'apps/server/src/api/controllers/people-controller.ts',
    'apps/server/src/api/dtos/people-list.dto.ts',
    'apps/server/src/application/db-people-list-manager.ts',
    'apps/server/src/application/db-church-access-manager.ts',
    'apps/server/src/application/db-ministry-membership-manager.ts',
    'apps/server/src/infrastructure/repositories/drizzle-people-list.repository.ts',
    'apps/server/src/infrastructure/repositories/drizzle-church-access.repository.ts',
    'apps/server/src/infrastructure/repositories/drizzle-ministry-membership.repository.ts',
    'apps/server/src/domain/authority/',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: PEOPLE_JOURNEY_SPEC_PATHS,
  })),
  // J4 (#667): the Invitations page (list and Invite dialog) and the list
  // controller the invited leader and Volunteer journey drives.
  {
    sourcePathPrefix: 'apps/web/src/features/invitations/',
    specPaths: INVITATION_JOURNEY_SPEC_PATHS,
  },
  {
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/_active-church/invitations/',
    specPaths: INVITATION_JOURNEY_SPEC_PATHS,
  },
  {
    sourcePathPrefix:
      'apps/server/src/api/controllers/invitation-controller.ts',
    specPaths: INVITATION_JOURNEY_SPEC_PATHS,
  },
  // J4 opens both joining links from the invitation emails this sender captured.
  {
    sourcePathPrefix:
      'apps/server/src/infrastructure/services/capture-email-sender.ts',
    specPaths: INVITATION_JOURNEY_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/web/src/routes/invitations/',
    specPaths: CHURCH_INVITATION_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/web/src/routes/_authenticated/invitations/',
    specPaths: REDEMPTION_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/web/src/infrastructure/api/redemption.ts',
    specPaths: CHURCH_INVITATION_SPEC_PATHS,
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
    // #288 — this prefix used to be the bare `.../scheduling` ancestor,
    // which (via startsWith) also matched every cycles/prepare/
    // assign path below it, pulling smoke/schedule-publish/guard-matrix/
    // capability-index into unrelated route changes. Narrowed to the exact
    // index route file: capability-index.spec.ts is the only spec that
    // navigates to the bare `/scheduling` landing page it renders.
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/_active-church/scheduling/index.tsx',
    specPaths: ['tests/scheduling/capability-index.spec.ts'],
  },
  {
    // Rendered only within the planning-admin surface (planning-admin.tsx
    // itself, and cycle-review-card.tsx inside components/planning-admin/).
    sourcePathPrefix:
      'apps/web/src/features/scheduling/components/planning-admin.tsx',
    specPaths: PLANNING_ADMIN_SPEC_PATHS,
  },
  {
    // Shared by every prepare component and route (manual-split-editor,
    // ministry-prepare-list, prepare-event-time-block-list, prepare-filters,
    // prepare-calendar, cycle-list.utils).
    sourcePathPrefix:
      'apps/web/src/features/scheduling/components/participation-prepare.utils.ts',
    specPaths: PREPARE_SPEC_PATHS,
  },
  {
    // The assign builder's assignment/staffing logic — used only by
    // components/builder/ and the assign route.
    sourcePathPrefix:
      'apps/web/src/features/scheduling/hooks/use-cycle-builder',
    specPaths: BUILDER_SPEC_PATHS,
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/scheduling/hooks/use-volunteer-pool.ts',
    specPaths: BUILDER_SPEC_PATHS,
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/scheduling/hooks/use-cycle-board-drag-scroll.ts',
    specPaths: BUILDER_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/web/src/features/scheduling/utils/builder/',
    specPaths: BUILDER_SPEC_PATHS,
  },
  {
    // Feeds the breadcrumb app-shell.tsx renders on every planning route,
    // the same one a11y-planning-nav.spec.ts scans.
    sourcePathPrefix:
      'apps/web/src/features/scheduling/hooks/use-ministry-breadcrumb.ts',
    specPaths: ['tests/scheduling/a11y-planning-nav.spec.ts'],
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/scheduling/hooks/use-cycle-breadcrumb.ts',
    specPaths: ['tests/scheduling/a11y-planning-nav.spec.ts'],
  },
  {
    // Cycle admin journey (#215): create cycle, build/apply the
    // template library (including the overnight-block span rule), add
    // manual events, resolve overlap, lock, navigate cycle/template/new
    // URLs, and review the calendar table — proven end to end by these four
    // specs, the only ones that exercise the cycles routes and
    // planning-admin feature components. The generic prefixes above only
    // select smoke/us4, which never touch this dialog-driven flow.
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/_active-church/_planning-admin',
    specPaths: [
      'tests/scheduling/event-templates.spec.ts',
      'tests/scheduling/cycles-table-view.spec.ts',
      'tests/scheduling/planning-nav-restructure.spec.ts',
      'tests/scheduling/us1-admin-plan.spec.ts',
      // #217 — right-sized: Church isolation on the list and the $cycleId
      // route, the two lock edge cases (network failure, double-submit), the
      // Church-local-time create-event journey, and the cross-route guard
      // matrix's ChurchAdmin-facing route all load through this route
      // family.
      ...CYCLE_EDGE_SPEC_PATHS,
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
      // #219 — this route family renders the breadcrumb a11y-planning-nav
      // scans and exact-match-tests.
      'tests/scheduling/a11y-planning-nav.spec.ts',
    ],
  },
  {
    // #289 — added planning-role-guard-matrix.spec.ts: verified via its
    // page.goto('/cycles'), which renders this
    // directory's components, matching the route-level entry above.
    sourcePathPrefix:
      'apps/web/src/features/scheduling/components/planning-admin/',
    specPaths: PLANNING_ADMIN_SPEC_PATHS,
  },
  {
    // BL-023 (#25): the shared DataTable convention wrapper is consumed by
    // both the planning-admin cycle list/review/template tables (#270,
    // #272, #274, #275) and the prepare ministry/cycle tables (#271,
    // #273), so a change here maps to both journeys' verified spec sets
    // instead of falling back to CRITICAL_SMOKE_SPEC_PATHS.
    sourcePathPrefix: 'apps/web/src/components/ui/data-table.tsx',
    specPaths: [
      'tests/scheduling/event-templates.spec.ts',
      'tests/scheduling/cycles-table-view.spec.ts',
      'tests/scheduling/planning-nav-restructure.spec.ts',
      'tests/scheduling/us1-admin-plan.spec.ts',
      ...CYCLE_EDGE_SPEC_PATHS,
      'tests/scheduling/us2-leader-prepare.spec.ts',
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
    ],
  },
  // Listed per file so the sibling `$cycleId/assign.tsx` board is not swept in
  // by a bare `schedules` prefix.
  ...PREPARE_ROUTE_FILES.map((sourcePathPrefix) => ({
    // #729: us2 drives the scoped Schedules list and Schedule page before
    // opening a nested Time block editor; asking belongs to Spec 22.
    sourcePathPrefix,
    specPaths: [
      'tests/scheduling/us2-leader-prepare.spec.ts',
      // #217 — the matrix's Volunteer-denial case and the merged-in Leader
      // positive control both load this bare index route directly.
      'tests/scheduling/planning-role-guard-matrix.spec.ts',
    ],
  })),
  ...[
    'apps/web/src/routes/_authenticated/_active-church/schedules/$ministryId/$cycleId/slots/$timeSlotId.tsx',
    'apps/web/src/features/scheduling/hooks/use-preparation-block-breadcrumbs.ts',
    'apps/web/src/features/scheduling/components/headcount-grid/',
    'apps/web/src/features/scheduling/components/shift-split-editor/',
  ].map((sourcePathPrefix) => ({
    // #729: nested-page load, shared split/grid controls, transactional Save
    // and the refreshed row summary are exercised against the real API/DB.
    sourcePathPrefix,
    specPaths: ['tests/scheduling/us2-leader-prepare.spec.ts'],
  })),
  {
    // J5 reaches this one-Ministry Prepare route from the N2 bell action.
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/_active-church/schedules/$ministryId/$cycleId/index.tsx',
    specPaths: CYCLE_HANDOFF_SPEC_PATHS,
  },
  {
    // Schedule breadcrumbs use leader-scoped metadata on the N2 destination.
    sourcePathPrefix:
      'apps/web/src/features/scheduling/hooks/use-cycle-breadcrumb.ts',
    specPaths: CYCLE_HANDOFF_SPEC_PATHS,
  },
  {
    // #289 — added smoke.spec.ts and us4-schedule-publish.spec.ts, verified
    // via their page.goto to a prepare route, which renders this
    // directory's components; matches PREPARE_SPEC_PATHS used above.
    sourcePathPrefix: 'apps/web/src/features/scheduling/components/prepare/',
    specPaths: PREPARE_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/web/src/infrastructure/api/prepare.ts',
    specPaths: ['tests/scheduling/us2-leader-prepare.spec.ts'],
  },
  {
    // Generated client shared by both the planning-admin (cycle/template/
    // event CRUD) and prepare (usual-setup, default-direction)
    // endpoints — verified by grepping both endpoint families into this one
    // file.
    sourcePathPrefix: 'apps/web/src/infrastructure/api/planning.ts',
    specPaths: [
      'tests/scheduling/event-templates.spec.ts',
      'tests/scheduling/cycles-table-view.spec.ts',
      'tests/scheduling/planning-nav-restructure.spec.ts',
      'tests/scheduling/us1-admin-plan.spec.ts',
      'tests/scheduling/us2-leader-prepare.spec.ts',
      ...CYCLE_EDGE_SPEC_PATHS,
    ],
  },
  // #214 — Church isolation (Ministry Invitation minting/resend) proven by
  // cross-tenant-invitation-isolation.spec.ts, coupled to the admin surface
  // that mints/resends invitations and the manager whose ensureMintableScope
  // returns the indistinguishable not-found (#68).
  {
    sourcePathPrefix: 'apps/server/src/api/controllers/ministry-controller.ts',
    specPaths: [
      'tests/identity/cross-tenant-invitation-isolation.spec.ts',
      ...INVITATION_JOURNEY_SPEC_PATHS,
    ],
  },
  {
    sourcePathPrefix:
      'apps/server/src/application/db-ministry-invitation-manager.ts',
    specPaths: [
      'tests/identity/cross-tenant-invitation-isolation.spec.ts',
      ...INVITATION_JOURNEY_SPEC_PATHS,
    ],
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
  // #219 — the breadcrumb component a11y-planning-nav.spec.ts scans and
  // exact-match-tests (aria-current) lives in the shared shell, not in a
  // per-feature file; a change here is what the T067 regression (falsely
  // marking ancestor breadcrumb links as the current page) came from.
  {
    sourcePathPrefix: 'apps/web/src/components/app-shell.tsx',
    specPaths: ['tests/scheduling/a11y-planning-nav.spec.ts'],
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
    specPaths: [
      ...CHURCH_INVITATION_SPEC_PATHS,
      ...VOLUNTEER_TRANSFER_SPEC_PATHS,
    ],
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
  // #216 — published-schedule visibility: the ministry-schedule dashboard
  // section is exercised directly by us4-ministry-schedule, and reused by
  // us4-schedule-publish to assert a volunteer sees a just-published shift.
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/components/ministry-schedule-section.tsx',
    specPaths: [
      'tests/scheduling/us4-schedule-publish.spec.ts',
      'tests/volunteer-dashboard/us4-ministry-schedule.spec.ts',
    ],
  },
  // #216 — the volunteer-facing generated API client backs the dashboard
  // (Availability/Assignment/ministry-schedule), the availability-check
  // journey (#210's initial smoke set), and schedule-publish's volunteer-side
  // assertion; verified by grepping each endpoint's only caller. #218 — it
  // also serves the /notifications, /notifications/:id, and
  // /notifications/read-all endpoints the bell and inbox call.
  {
    sourcePathPrefix: 'apps/web/src/infrastructure/api/volunteer.ts',
    specPaths: [
      ...VOLUNTEER_DASHBOARD_SPEC_PATHS,
      ...NOTIFICATION_BELL_SPEC_PATHS,
      'tests/scheduling/us3-volunteer-availability.spec.ts',
      'tests/scheduling/us4-schedule-publish.spec.ts',
    ],
  },
  // #218 — the notification bell (header, every page) and the /notifications
  // inbox page, proven end to end by this one spec.
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/components/notification-bell.tsx',
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
  {
    // J5 observes a live N2 from Send, complementing the bell history seam.
    sourcePathPrefix: 'apps/web/src/features/notifications/',
    specPaths: [...NOTIFICATION_BELL_SPEC_PATHS, ...CYCLE_HANDOFF_SPEC_PATHS],
  },
  // #216 — the assign (assignment/publish) generated API client backs the
  // cycle-builder used at the assign route; already the exact spec pair
  // the critical-smoke fallback would run, made explicit rather than
  // incidental.
  {
    sourcePathPrefix: 'apps/web/src/infrastructure/api/assign.ts',
    specPaths: [
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us4-schedule-publish.spec.ts',
      // #217 — team-scoped assignment/removal (qualification), the focused
      // pick-me commit (builder-event-time-block-focus), and the volunteer-notify/leader-
      // reassign flow (us5-leader-reassign) all call this client's assignment
      // endpoints.
      'tests/scheduling/qualification.spec.ts',
      'tests/scheduling/builder-event-time-block-focus.spec.ts',
      'tests/scheduling/us5-leader-reassign.spec.ts',
    ],
  },
  // #219 — the schedule builder route and its feature components are what
  // a11y-builder.spec.ts's axe-core scan drives. Scoped narrower than the
  // broad `.../scheduling` prefix above (which also matches cycles
  // and prepare changes this a11y spec never touches) — real browser paint
  // is needed for a WCAG contrast/semantics scan, which is why this stays at
  // the Playwright layer instead of moving down like #219's other six specs.
  {
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/_active-church/schedules/$ministryId/$cycleId/assign',
    specPaths: ['tests/scheduling/a11y-builder.spec.ts'],
  },
  {
    // #289 — added smoke/builder-event-time-block-focus/qualification, verified via
    // their page.goto to the assign builder URL this directory renders;
    // matches BUILDER_SPEC_PATHS used above for the hooks/utils it owns.
    sourcePathPrefix: 'apps/web/src/features/scheduling/components/builder/',
    specPaths: BUILDER_SPEC_PATHS,
  },
  // #217 — the church-admin-controller owns every cycle and event
  // endpoint these specs drive: list/detail isolation and the lock edge
  // cases (cross-cutting, DL4-X1/X2/X3), the $cycleId isolation route
  // (planning-cross-tenant-isolation), and quick-create's Church-local
  // Instant (single-create-event-ui).
  {
    sourcePathPrefix:
      'apps/server/src/api/controllers/church-admin-controller.ts',
    specPaths: [...CYCLE_EDGE_SPEC_PATHS, ...CYCLE_HANDOFF_SPEC_PATHS],
  },
  {
    // J5 follows the actual Send transaction: graph validation, staffing
    // pre-fill and N2 enqueue all occur in this manager.
    sourcePathPrefix: 'apps/server/src/application/db-cycle-manager.ts',
    specPaths: CYCLE_HANDOFF_SPEC_PATHS,
  },
  {
    // J5 edits retained Event blocks and removes a Draft Event before Send.
    sourcePathPrefix:
      'apps/server/src/application/db-planning-event-manager.ts',
    specPaths: CYCLE_HANDOFF_SPEC_PATHS,
  },
  {
    sourcePathPrefix:
      'apps/server/src/application/usual-setup-staffing-seeder.ts',
    specPaths: CYCLE_HANDOFF_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/server/src/application/church-notifications.ts',
    specPaths: CYCLE_HANDOFF_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/server/src/application/db-outbox-drainer.ts',
    specPaths: CYCLE_HANDOFF_SPEC_PATHS,
  },
  // #217 — the assign controller owns shift assignment, unassignment, and
  // reassignment: qualification's team-boundary 403, builder-event-time-block-focus's
  // focused commit, and us5-leader-reassign's mid-cycle reassign.
  {
    sourcePathPrefix: 'apps/server/src/api/controllers/assign-controller.ts',
    specPaths: [
      'tests/scheduling/qualification.spec.ts',
      'tests/scheduling/builder-event-time-block-focus.spec.ts',
      'tests/scheduling/us5-leader-reassign.spec.ts',
    ],
  },
  // #217 — the volunteer controller's own-assignment cancel endpoint is what
  // proves a different volunteer gets a 403, not just a UI affordance. #218 —
  // it also owns the /notifications list, read, and read-all endpoints the
  // bell and inbox call.
  {
    sourcePathPrefix: 'apps/server/src/api/controllers/volunteer-controller.ts',
    specPaths: [
      'tests/scheduling/us5-leader-reassign.spec.ts',
      ...NOTIFICATION_BELL_SPEC_PATHS,
    ],
  },
  // #327 — journey recipes build the graph a spec starts from, through the
  // shared seed builders, blueprints and the provisioning scripts they call:
  // a change to any can break the journeys that load a recipe. Add each spec
  // that loads one.
  {
    sourcePathPrefix: 'apps/server/seeds/',
    specPaths: JOURNEY_RECIPE_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/server/src/scripts/provision-church.ts',
    specPaths: JOURNEY_RECIPE_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/server/src/scripts/init-system.ts',
    specPaths: JOURNEY_RECIPE_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/server/src/scripts/ensure-platform-operator.ts',
    specPaths: JOURNEY_RECIPE_SPEC_PATHS,
  },
];
