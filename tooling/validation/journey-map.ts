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

// #900: production files every journey runs through, kept on the critical
// smoke fallback on purpose: no journey set is narrower than "run what is
// critical". journey-map-guard fails when a path here is missing or a
// JOURNEY_MAP prefix starts to cover it, so the list cannot drift silently.
export const DELIBERATE_SMOKE_FALLBACK_PATHS: {
  path: string;
  reason: string;
}[] = [
  {
    path: 'apps/server/src/infrastructure/repositories/helpers.ts',
    reason: 'shared by most Drizzle repositories',
  },
  {
    path: 'apps/server/src/main/di/build-controllers.ts',
    reason: 'wires every HTTP controller',
  },
];

const BOOT_SHELL_SPEC_PATH = 'tests/identity/sign-in-boot-shell.spec.ts';

const REDEMPTION_SPEC_PATHS = [
  'tests/identity/redemption-new-user.spec.ts',
  'tests/identity/redemption-existing-member.spec.ts',
  'tests/identity/redemption-church-only-sign-in.spec.ts',
];

// The public Church Invitation join also serves the plain first-admin
// invitation (J0→J1); the authenticated Ministry route does not.
const INVITATION_JOURNEY_SPEC_PATHS = [
  'tests/identity/invitation-journey.spec.ts',
];

// J2 (#682): People directory and member detail, the Ministry Role edit and
// the Church access change it consumes from People A.
const PEOPLE_JOURNEY_SPEC_PATHS = ['tests/people/people-journey.spec.ts'];

// #1017 (#996): Church Settings, the logo upload through object storage and
// the settings save, reloaded; a Member is kept off the screen.
const CHURCH_SETTINGS_JOURNEY_SPEC_PATHS = [
  'tests/church-settings/church-settings-journey.spec.ts',
];

// #1045 (#1001): the Public Church Profile read signed out: Programme, a moved
// and a cancelled Public Event, the old-slug redirect, a private contact absent.
const PUBLIC_CHURCH_PROFILE_SPEC_PATHS = [
  'tests/public-church/public-church-profile.spec.ts',
];

// #1027 (#1002): a monthly template winning over the weekly Sunday one, saved
// through the collision prompt and applied to a Cycle.
const TEMPLATE_PRECEDENCE_SPEC_PATHS = [
  'tests/scheduling/template-precedence.spec.ts',
];

// #900: the Ministries page (search, status filter, counts) and a Ministry's
// Usual setup.
const MINISTRIES_JOURNEY_SPEC_PATHS = [
  'tests/ministries/ministries-directory.spec.ts',
];

// #948: the Ministry tab bar at 320px.
const MINISTRY_TABS_SPEC_PATHS = [
  'tests/ministries/ministry-tabs-narrow.spec.ts',
];

// #949: the preparation side panel (close animation, X guard, narrow h1,
// return scroll under the sticky mobile bar).
const PREPARE_PANEL_SPEC_PATHS = ['tests/scheduling/prepare-panel.spec.ts'];

// #905: an unreachable API, the reconnecting banner and recovery.
const RECONNECTING_SPEC_PATHS = [
  'tests/resilience/reconnecting-banner.spec.ts',
];

const CHURCH_INVITATION_SPEC_PATHS = [
  'tests/identity/first-admin-onboarding.spec.ts',
  ...INVITATION_JOURNEY_SPEC_PATHS,
  ...REDEMPTION_SPEC_PATHS,
];

const CHURCH_INVITATION_SOURCE_PREFIXES = [
  'apps/web/src/features/invitations/components/invitation-review-parts.tsx',
  'apps/server/src/api/dtos/redemption.dto.ts',
  'apps/server/src/application/db-redemption-manager.ts',
  'apps/server/src/domain/contracts/application/redemption-manager.ts',
  'apps/server/src/domain/contracts/infrastructure/ministry-invitation.repository.ts',
  'apps/server/src/domain/entities/redemption-bundle.ts',
  'apps/server/src/domain/services/invitations/redemption-review-token.ts',
  'apps/server/src/infrastructure/repositories/drizzle-ministry-invitation.repository.ts',
  'apps/web/src/routeTree.gen.ts',
];

const VOLUNTEER_TRANSFER_SPEC_PATHS = [
  'tests/identity/volunteer-transfer-journey.spec.ts',
];

// #216 — the dashboard shell and its shared hooks/lib feed all three of the
// Availability, Assignment, and Ministry Schedule sections at once, so a
// change there is verified by all three specs together. #218 — the same
// shell and hooks (use-online-state, use-my-schedule-refresh,
// dashboard-query-options' cached-snapshot reads) also drive the offline
// experience proven by us5-offline, so it joins this shared group.
const VOLUNTEER_DASHBOARD_SPEC_PATHS = [
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
// J9 (#812): swap request raise, keep, re-raise and cover.
const SWAP_REQUEST_SPEC_PATHS = ['tests/scheduling/j9-swap-request.spec.ts'];

// J10 (#826): a ChurchAdmin cancels a whole future Event after Send.
const ADMIN_CANCEL_SPEC_PATHS = ['tests/scheduling/j10-admin-cancel.spec.ts'];

// J11 (#1056): a ChurchAdmin edits a sent Event; the Assignment stays and
// Send updates tells the Volunteer.
const ADMIN_EDIT_SPEC_PATHS = ['tests/scheduling/j11-admin-edit-event.spec.ts'];

const JOURNEY_RECIPE_SPEC_PATHS = [
  'tests/identity/active-church-switching.spec.ts',
  'tests/identity/cross-tenant-invitation-isolation.spec.ts',
  'tests/identity/first-admin-onboarding.spec.ts',
  'tests/identity/invitation-journey.spec.ts',
  'tests/identity/redemption-existing-member.spec.ts',
  'tests/identity/redemption-church-only-sign-in.spec.ts',
  'tests/identity/redemption-new-user.spec.ts',
  // Signs in as the shared personas global setup loads from a recipe.
  'tests/identity/route-protection.spec.ts',
  'tests/identity/volunteer-transfer-journey.spec.ts',
  ...PEOPLE_JOURNEY_SPEC_PATHS,
  ...MINISTRIES_JOURNEY_SPEC_PATHS,
  ...CHURCH_SETTINGS_JOURNEY_SPEC_PATHS,
  ...PUBLIC_CHURCH_PROFILE_SPEC_PATHS,
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
  ...TEMPLATE_PRECEDENCE_SPEC_PATHS,
  ...LEADER_AVAILABILITY_SPEC_PATHS,
  ...VOLUNTEER_AVAILABILITY_SPEC_PATHS,
  ...SWAP_REQUEST_SPEC_PATHS,
  ...ADMIN_CANCEL_SPEC_PATHS,
  ...ADMIN_EDIT_SPEC_PATHS,
  'tests/scheduling/us4-schedule-publish.spec.ts',
  'tests/scheduling/us5-leader-reassign.spec.ts',
  'tests/volunteer-dashboard/us-notification-bell.spec.ts',
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
  ...TEMPLATE_PRECEDENCE_SPEC_PATHS,
  'tests/scheduling/cycles-table-view.spec.ts',
  'tests/scheduling/planning-nav-restructure.spec.ts',
  'tests/scheduling/planning-role-guard-matrix.spec.ts',
  'tests/scheduling/us1-admin-plan.spec.ts',
  ...CYCLE_EDGE_SPEC_PATHS,
];

// #1253: a leader exports a Schedule from Prepare; the dialog reads the
// Ministry's Event groups for its default split.
const SCHEDULE_EXPORT_SPEC_PATHS = ['tests/scheduling/schedule-export.spec.ts'];

const PREPARE_SPEC_PATHS = [
  'tests/scheduling/planning-role-guard-matrix.spec.ts',
  'tests/scheduling/smoke.spec.ts',
  'tests/scheduling/us2-leader-prepare.spec.ts',
  'tests/scheduling/us4-schedule-publish.spec.ts',
];

// #1167: committing, removing and reassigning Assignments, and covering a
// swap request.
const ASSIGNMENT_SPEC_PATHS = [
  'tests/scheduling/qualification.spec.ts',
  'tests/scheduling/builder-event-time-block-focus.spec.ts',
  'tests/scheduling/us5-leader-reassign.spec.ts',
  'tests/scheduling/us4-schedule-publish.spec.ts',
  ...SWAP_REQUEST_SPEC_PATHS,
];

// #900: the scoped Schedules list (`/schedules`).
const SCHEDULE_LIST_SPEC_PATHS = [
  'tests/scheduling/capability-index.spec.ts',
  'tests/scheduling/planning-role-guard-matrix.spec.ts',
  'tests/scheduling/us2-leader-prepare.spec.ts',
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
  'schedules/$ministryId/$cycleId/_prepare',
].map((f) => `apps/web/src/routes/app/_active-church/${f}`);

function mapEach({
  paths,
  specPaths,
}: {
  paths: string[];
  specPaths: string[];
}): JourneyMapping[] {
  return paths.map((sourcePathPrefix) => ({ sourcePathPrefix, specPaths }));
}

export const JOURNEY_MAP: JourneyMapping[] = [
  ...[
    'apps/web/src/routes/app/_active-church/availability.tsx',
    'apps/web/src/routes/app/_active-church/availability_.$checkId.tsx',
    'apps/web/src/features/volunteers/components/availability-list-page.tsx',
    'apps/web/src/features/volunteers/components/availability-detail-page.tsx',
    'apps/web/src/features/volunteers/components/availability-detail/',
    'apps/web/src/features/volunteers/hooks/use-availability-answer.ts',
    'apps/web/src/features/volunteers/lib/availability-format.ts',
    'apps/web/src/features/volunteers/hooks/use-availability-check-breadcrumb.ts',
    'apps/web/src/features/volunteers/hooks/use-local-availability-draft.ts',
    'apps/web/src/features/volunteers/lib/unavailable-shifts.ts',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: VOLUNTEER_AVAILABILITY_SPEC_PATHS,
  })),
  ...[
    'apps/web/src/routes/app/_active-church/schedules/$ministryId/$cycleId/_prepare',
    'apps/web/src/routes/app/_active-church/schedules/$ministryId/$cycleId/_prepare/slots/$timeSlotId.tsx',
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
    'apps/web/src/routes/app/_active-church/people',
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
  ...[
    'apps/web/src/features/church-settings/',
    'apps/web/src/routes/app/_active-church/church-settings',
    'apps/server/src/api/controllers/church-settings-controller.ts',
    'apps/server/src/api/dtos/church-settings.dto.ts',
    'apps/server/src/application/db-church-settings-manager.ts',
    'apps/server/src/application/church-logo-pipeline.ts',
    'apps/server/src/domain/church-settings.ts',
    'apps/server/src/domain/church-logo.ts',
    'apps/server/src/infrastructure/storage/',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: CHURCH_SETTINGS_JOURNEY_SPEC_PATHS,
  })),
  ...[
    'apps/web/src/features/public-church/',
    'apps/web/src/routes/$slug.tsx',
    'apps/web/src/infrastructure/api/public-church-profile.ts',
    'apps/server/src/api/controllers/public-church-profile-controller.ts',
    'apps/server/src/api/dtos/public-church-profile.dto.ts',
    'apps/server/src/api/dtos/public-event.dto.ts',
    'apps/server/src/api/utils/church-page-head.ts',
    'apps/server/src/application/db-church-programme-manager.ts',
    'apps/server/src/application/db-public-church-profile-manager.ts',
    'apps/server/src/application/db-public-event-manager.ts',
    'apps/server/src/domain/public-event-cursor.ts',
    'apps/server/src/domain/programme-order.ts',
    'apps/server/src/domain/entities/public-event.ts',
    'apps/server/src/infrastructure/repositories/drizzle-church-programme.repository.ts',
    'apps/server/src/infrastructure/repositories/drizzle-public-event.repository.ts',
    'apps/server/src/infrastructure/repositories/drizzle-public-event.repository.types.ts',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: PUBLIC_CHURCH_PROFILE_SPEC_PATHS,
  })),
  // Address actions and directions serve both the Settings preview and the public page.
  ...[
    'apps/web/src/shared/components/address-actions.tsx',
    'apps/web/src/shared/utils/directions.ts',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: [
      ...CHURCH_SETTINGS_JOURNEY_SPEC_PATHS,
      ...PUBLIC_CHURCH_PROFILE_SPEC_PATHS,
    ],
  })),
  {
    sourcePathPrefix:
      'apps/web/src/features/ministries/components/ministry-workspace.tsx',
    specPaths: MINISTRY_TABS_SPEC_PATHS,
  },
  ...[
    'apps/web/src/routes/app/_active-church/schedules/$ministryId/$cycleId/_prepare.tsx',
    'apps/web/src/features/scheduling/components/prepare/preparation-block-editor.tsx',
    'apps/web/src/features/scheduling/components/prepare/prepare-event-time-block-list.tsx',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: PREPARE_PANEL_SPEC_PATHS,
  })),
  // #900: the server-side list filtering, counts and paging of #899.
  ...[
    'apps/web/src/features/ministries/components/ministry-list-page.tsx',
    'apps/web/src/features/ministries/components/usual-setup/usual-setup-list.tsx',
    'apps/web/src/features/ministries/ministry-queries.ts',
    'apps/web/src/routes/app/_active-church/ministries/index.tsx',
    'apps/server/src/api/dtos/ministry.dto.ts',
    'apps/server/src/domain/ministry-list-cursor.ts',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: MINISTRIES_JOURNEY_SPEC_PATHS,
  })),
  // Ministry and participation persistence serves far more than the lists, so
  // these keep the critical smoke set and add the list journeys.
  ...[
    'apps/server/src/application/db-ministry-manager.ts',
    'apps/server/src/domain/contracts/application/ministry-manager.ts',
    'apps/server/src/domain/contracts/infrastructure/ministry.repository.ts',
    'apps/server/src/domain/entities/ministry.ts',
    'apps/server/src/infrastructure/repositories/drizzle-ministry.repository.ts',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: [...MINISTRIES_JOURNEY_SPEC_PATHS, ...CRITICAL_SMOKE_SPEC_PATHS],
  })),
  ...[
    'apps/server/src/domain/contracts/infrastructure/ministry-participation.repository.ts',
    'apps/server/src/domain/entities/ministry-participation.ts',
    'apps/server/src/infrastructure/repositories/drizzle-ministry-participation.repository.ts',
    'apps/server/src/infrastructure/repositories/drizzle-ministry-participation.repository.types.ts',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: [
      ...SCHEDULE_LIST_SPEC_PATHS,
      ...PREPARE_SPEC_PATHS,
      ...CRITICAL_SMOKE_SPEC_PATHS,
    ],
  })),
  {
    sourcePathPrefix: 'apps/server/src/domain/schedule-list-cursor.ts',
    specPaths: SCHEDULE_LIST_SPEC_PATHS,
  },
  {
    // The Schedules list, the Prepare route and its breadcrumbs read it.
    sourcePathPrefix: 'apps/web/src/features/scheduling/hooks/use-schedule.ts',
    specPaths: [
      ...SCHEDULE_LIST_SPEC_PATHS,
      ...PREPARE_SPEC_PATHS,
      ...CYCLE_HANDOFF_SPEC_PATHS,
    ],
  },
  {
    // Home renders Leadership for a leader or admin; both specs load `/` so.
    sourcePathPrefix:
      'apps/web/src/features/home/components/leadership-section.tsx',
    specPaths: [
      'tests/scheduling/event-templates.spec.ts',
      ...CYCLE_HANDOFF_SPEC_PATHS,
    ],
  },
  {
    sourcePathPrefix: 'apps/server/src/domain/list-cursor.ts',
    specPaths: [
      ...INVITATION_JOURNEY_SPEC_PATHS,
      ...PEOPLE_JOURNEY_SPEC_PATHS,
      ...MINISTRIES_JOURNEY_SPEC_PATHS,
      ...SCHEDULE_LIST_SPEC_PATHS,
    ],
  },
  ...[
    'apps/server/src/domain/invitation-list-cursor.ts',
    'apps/server/src/infrastructure/repositories/drizzle-invitation-list.repository.ts',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: INVITATION_JOURNEY_SPEC_PATHS,
  })),
  {
    sourcePathPrefix: 'apps/server/src/domain/people-list-cursor.ts',
    specPaths: PEOPLE_JOURNEY_SPEC_PATHS,
  },
  {
    // The paged list routes: Invitations, People, Ministries, Notifications
    // and Schedules.
    sourcePathPrefix: 'apps/server/src/api/dtos/page-limit.dto.ts',
    specPaths: [
      ...INVITATION_JOURNEY_SPEC_PATHS,
      ...PEOPLE_JOURNEY_SPEC_PATHS,
      ...MINISTRIES_JOURNEY_SPEC_PATHS,
      ...NOTIFICATION_BELL_SPEC_PATHS,
      ...SCHEDULE_LIST_SPEC_PATHS,
    ],
  },
  {
    // The bell's inbox, and the N2 that J5 polls for.
    sourcePathPrefix:
      'apps/server/src/api/controllers/notification-controller.ts',
    specPaths: [...NOTIFICATION_BELL_SPEC_PATHS, ...CYCLE_HANDOFF_SPEC_PATHS],
  },
  {
    // The Invitations, Ministries and Schedules list searches.
    sourcePathPrefix: 'apps/web/src/shared/hooks/use-debounced-search.ts',
    specPaths: [
      ...INVITATION_JOURNEY_SPEC_PATHS,
      ...MINISTRIES_JOURNEY_SPEC_PATHS,
      ...SCHEDULE_LIST_SPEC_PATHS,
    ],
  },
  // J4 (#667): the Invitations page (list and Invite dialog) and the list
  // controller the invited leader and Volunteer journey drives.
  {
    sourcePathPrefix: 'apps/web/src/features/invitations/',
    specPaths: INVITATION_JOURNEY_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/web/src/routes/app/_active-church/invitations/',
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
    sourcePathPrefix: 'apps/web/src/routes/app/invitations/',
    specPaths: REDEMPTION_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/web/src/infrastructure/api/redemption.ts',
    specPaths: CHURCH_INVITATION_SPEC_PATHS,
  },
  // #945: signed-in acceptance of a Church Invitation (review, accept, route tree).
  ...CHURCH_INVITATION_SOURCE_PREFIXES.map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: CHURCH_INVITATION_SPEC_PATHS,
  })),
  {
    sourcePathPrefix: 'apps/web/src/routes/app/_active-church.tsx',
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
    sourcePathPrefix: 'apps/web/src/routes/app/_active-church/_planning-admin',
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
    'apps/web/src/routes/app/_active-church/schedules/$ministryId/$cycleId/_prepare/slots/$timeSlotId.tsx',
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
      'apps/web/src/routes/app/_active-church/schedules/$ministryId/$cycleId/_prepare',
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
      ...MINISTRIES_JOURNEY_SPEC_PATHS,
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
    sourcePathPrefix: 'apps/web/src/routes/app.tsx',
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
  // #905: the reconnecting banner and the outage rule cross the
  // browser/API boundary only in this spec.
  {
    sourcePathPrefix: 'apps/web/src/components/reconnecting-banner.tsx',
    specPaths: RECONNECTING_SPEC_PATHS,
  },
  {
    sourcePathPrefix: 'apps/web/src/shared/utils/outage.ts',
    specPaths: RECONNECTING_SPEC_PATHS,
  },
  // Every page reads through the shared query client, so it keeps the
  // critical smoke set alongside its own spec.
  {
    sourcePathPrefix: 'apps/web/src/utils/api.ts',
    specPaths: [...RECONNECTING_SPEC_PATHS, ...CRITICAL_SMOKE_SPEC_PATHS],
  },
  {
    sourcePathPrefix: 'apps/web/src/routes/login.tsx',
    specPaths: ['tests/identity/route-protection.spec.ts'],
  },
  // index.html's boot shell outlines AuthShell and its three forms; the spec
  // pins every bar to its element. It follows what that geometry reads: the
  // shell's own CSS, AuthShell and the forms (markup and the copy they render),
  // the controls the forms are built from, and the routes whose search decides
  // whether the shell shows. The message files need no entry: the shell sets
  // the same copy the forms render, so a copy change cannot move a bar.
  // Files that had no entry keep the critical smoke set they fell back to.
  ...[
    'apps/web/index.html',
    'apps/web/src/first-paint.css',
    'apps/web/src/components/auth-shell.tsx',
    'apps/web/src/routes/login.tsx',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: [BOOT_SHELL_SPEC_PATH],
  })),
  ...[
    'apps/web/src/components/sign-in-form.tsx',
    'apps/web/src/components/forgot-password-form.tsx',
    'apps/web/src/components/reset-password-form.tsx',
    'apps/web/src/routes/forgot-password.tsx',
    'apps/web/src/routes/reset-password.tsx',
    'apps/web/src/index.css',
    'apps/web/src/main.tsx',
    'apps/web/src/components/ui/button.tsx',
    'apps/web/src/components/ui/input.tsx',
    'apps/web/src/components/ui/label.tsx',
    'apps/web/src/components/ui/form-control-size.tsx',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: [BOOT_SHELL_SPEC_PATH, ...CRITICAL_SMOKE_SPEC_PATHS],
  })),
  {
    sourcePathPrefix: 'apps/web/src/shared/utils/return-target.ts',
    specPaths: ['tests/identity/route-protection.spec.ts'],
  },
  {
    sourcePathPrefix: 'apps/web/src/routes/app/_active-church/index.tsx',
    specPaths: ['tests/identity/route-protection.spec.ts'],
  },
  // #214 — Volunteer Transfer (#65): the split screen and its three
  // confirmation layers live in the ministry-invitation route and the
  // volunteer-transfer feature; the server side is the redemption
  // controller's transfer preview/confirm endpoints (which also serve plain
  // redemption, hence both spec sets) and the transfer manager.
  {
    sourcePathPrefix: 'apps/web/src/routes/app/invitations/ministry/',
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
    sourcePathPrefix: 'apps/web/src/routes/app/_active-church/dashboard.tsx',
    specPaths: VOLUNTEER_DASHBOARD_SPEC_PATHS,
  },
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/hooks/use-my-schedule-refresh.ts',
    specPaths: VOLUNTEER_DASHBOARD_SPEC_PATHS,
  },
  {
    // #218 — shared by every dashboard hook (use-volunteer-dashboard,
    // use-my-schedule-refresh) and by use-notification-inbox, so a change here
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
      'apps/web/src/features/volunteers/components/my-schedule-offline-banner.tsx',
    specPaths: ['tests/volunteer-dashboard/us5-offline.spec.ts'],
  },
  // J8 exercises publication, changes, Send updates and recipient bell details.
  ...[
    'apps/server/src/domain/schedule-changes.ts',
    'apps/server/src/domain/notification-kinds.ts',
    'apps/server/src/application/church-notifier.ts',
    'apps/server/src/application/db-outbox-drainer.ts',
    'apps/web/src/features/notifications/lib/notification-render.ts',
    'apps/web/src/features/notifications/lib/notification-navigation.ts',
    'apps/web/src/features/scheduling/components/prepare/schedule-publish.tsx',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: ['tests/scheduling/us4-schedule-publish.spec.ts'],
  })),
  // #216 — published-schedule visibility: the ministry-schedule dashboard
  // section is exercised directly by us4-ministry-schedule, and reused by
  // us4-schedule-publish to assert a volunteer sees a just-published shift.
  {
    sourcePathPrefix:
      'apps/web/src/features/volunteers/components/my-ministry-schedule-page.tsx',
    specPaths: ['tests/scheduling/us4-schedule-publish.spec.ts'],
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
  // #218 — the /notifications inbox page, proven end to end by this one spec.
  {
    sourcePathPrefix:
      'apps/web/src/routes/app/_active-church/notifications.tsx',
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
      'apps/web/src/routes/app/_active-church/schedules/$ministryId/$cycleId/assign',
    specPaths: ['tests/scheduling/a11y-builder.spec.ts'],
  },
  {
    // #289 — added smoke/builder-event-time-block-focus/qualification, verified via
    // their page.goto to the assign builder URL this directory renders;
    // matches BUILDER_SPEC_PATHS used above for the hooks/utils it owns.
    sourcePathPrefix: 'apps/web/src/features/scheduling/components/builder/',
    specPaths: BUILDER_SPEC_PATHS,
  },
  // J9 (#812) — the Volunteer swap-request surfaces and N7/N8 notification
  // rendering/navigation it drives.
  ...[
    'apps/web/src/features/scheduling/components/builder/swap-request/',
    'apps/web/src/features/volunteers/components/swap-request-sheet.tsx',
    'apps/web/src/features/volunteers/components/swap-withdraw-button.tsx',
    'apps/web/src/features/volunteers/components/assignment-detail-page.tsx',
    'apps/web/src/infrastructure/api/swap-requests.ts',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: SWAP_REQUEST_SPEC_PATHS,
  })),
  // J10 (#826) — the Event cancellation dialog and its entry points.
  ...[
    'apps/web/src/features/scheduling/components/planning-admin/event-cancel-dialog.tsx',
    'apps/web/src/features/scheduling/components/planning-admin/event-edit-page.tsx',
    'apps/server/src/api/utils/cancel-confirmation.ts',
    'apps/server/src/domain/services/planning/event-cancellation.ts',
    'apps/server/src/domain/errors/admin-cancellation-window-closed.ts',
    'apps/server/src/domain/errors/cancel-confirmation-mismatch.ts',
    'apps/server/src/domain/contracts/application/planning-event-manager.ts',
    'apps/server/src/domain/contracts/infrastructure/planning-event.repository.ts',
    'apps/server/src/infrastructure/repositories/drizzle-planning-event.repository.ts',
    'apps/server/src/infrastructure/repositories/drizzle-planning-event.repository.types.ts',
    'apps/server/src/infrastructure/repositories/drizzle-assignment-audit.repository.ts',
    'apps/server/src/infrastructure/mappers/event-time-block.mapper.ts',
    'apps/server/src/infrastructure/services/email-templates.ts',
    'apps/server/src/domain/contracts/infrastructure/email-sender.ts',
    'apps/server/src/api/dtos/planning-event.dto.ts',
    'apps/server/src/api/dtos/member-notification.dto.ts',
    'apps/server/src/api/utils/error-messages.ts',
    'apps/server/src/api/utils/error-table.ts',
    'apps/server/src/application/db-volunteer-manager.ts',
    'apps/server/src/domain/errors/index.ts',
    'apps/server/src/domain/errors/validation-rule-error.ts',
    'apps/web/src/infrastructure/api/churchAPI.schemas.ts',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: ADMIN_CANCEL_SPEC_PATHS,
  })),
  // J11 (#1056) — the sent-Event edit dialog and its entry points.
  ...[
    'apps/web/src/features/scheduling/components/planning-admin/event-edit-preview.tsx',
    'apps/web/src/features/scheduling/components/planning-admin/calendar-row.tsx',
    'apps/web/src/features/scheduling/components/planning-admin/planning-event-card.tsx',
    'apps/web/src/features/scheduling/components/planning-admin/cycle-review-card.tsx',
  ].map((sourcePathPrefix) => ({
    sourcePathPrefix,
    specPaths: ADMIN_EDIT_SPEC_PATHS,
  })),
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
  // bell and inbox call. #746 — its /answer endpoint also owns J7.
  {
    sourcePathPrefix: 'apps/server/src/api/controllers/volunteer-controller.ts',
    specPaths: [
      ...VOLUNTEER_AVAILABILITY_SPEC_PATHS,
      'tests/scheduling/us5-leader-reassign.spec.ts',
      ...NOTIFICATION_BELL_SPEC_PATHS,
    ],
  },
  // #1167: the scheduling modules split out of the old participation manager,
  // the shared Assignment rules, and their web twins.
  ...mapEach({
    paths: [
      'apps/server/src/application/db-assignment-manager.ts',
      'apps/server/src/domain/contracts/application/assignment-manager.ts',
      'apps/server/src/domain/errors/shift-started.ts',
    ],
    specPaths: ASSIGNMENT_SPEC_PATHS,
  }),
  // Cancelling an Event releases Assignments through the lifecycle too.
  ...mapEach({
    paths: [
      'apps/server/src/application/assignment-lifecycle.ts',
      'apps/server/src/domain/contracts/application/assignment-lifecycle.ts',
    ],
    specPaths: [...ASSIGNMENT_SPEC_PATHS, ...ADMIN_CANCEL_SPEC_PATHS],
  }),
  ...mapEach({
    paths: [
      'apps/server/src/domain/services/scheduling/assignment-eligibility.ts',
      'apps/server/src/domain/services/scheduling/assignment-eligibility.types.ts',
      'apps/server/src/api/dtos/assign.dto.ts',
      'apps/server/src/api/dtos/cycle-builder.dto.ts',
      'apps/web/src/features/scheduling/utils/scheduling-rules.ts',
      'apps/web/src/features/scheduling/utils/shift-verdict.ts',
    ],
    specPaths: [...ASSIGNMENT_SPEC_PATHS, ...BUILDER_SPEC_PATHS],
  }),
  ...mapEach({
    paths: ['apps/server/src/domain/event-time-block-cancellation.ts'],
    specPaths: [
      ...ASSIGNMENT_SPEC_PATHS,
      ...BUILDER_SPEC_PATHS,
      ...ADMIN_CANCEL_SPEC_PATHS,
    ],
  }),
  ...mapEach({
    paths: ['apps/server/src/domain/entities/shift.ts'],
    specPaths: [...ASSIGNMENT_SPEC_PATHS, ...PREPARE_SPEC_PATHS],
  }),
  ...mapEach({
    paths: [
      'apps/server/src/application/db-assignment-proposal-manager.ts',
      'apps/server/src/domain/contracts/application/assignment-proposal-manager.ts',
      'apps/server/src/domain/services/scheduling/assignment-proposal.ts',
    ],
    specPaths: ['tests/scheduling/us4-schedule-publish.spec.ts'],
  }),
  ...mapEach({
    paths: [
      'apps/server/src/application/db-schedule-builder-reader.ts',
      'apps/server/src/domain/contracts/application/schedule-builder-reader.ts',
    ],
    specPaths: BUILDER_SPEC_PATHS,
  }),
  ...mapEach({
    paths: [
      'apps/server/src/application/db-schedule-publisher.ts',
      'apps/server/src/domain/contracts/application/schedule-publisher.ts',
    ],
    specPaths: [
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us4-schedule-publish.spec.ts',
    ],
  }),
  // What changed since a Volunteer was last told: Send updates.
  ...mapEach({
    paths: [
      'apps/server/src/application/db-schedule-change-reader.ts',
      'apps/server/src/domain/contracts/application/schedule-change-reader.ts',
    ],
    specPaths: [
      'tests/scheduling/us4-schedule-publish.spec.ts',
      ...SWAP_REQUEST_SPEC_PATHS,
      ...ADMIN_EDIT_SPEC_PATHS,
    ],
  }),
  ...mapEach({
    paths: [
      'apps/server/src/application/db-schedule-read-model.ts',
      'apps/server/src/domain/contracts/application/schedule-read-model.ts',
    ],
    specPaths: [...SCHEDULE_LIST_SPEC_PATHS, ...PREPARE_SPEC_PATHS],
  }),
  ...mapEach({
    paths: [
      'apps/server/src/application/db-prepare-manager.ts',
      'apps/server/src/domain/contracts/application/prepare-manager.ts',
      'apps/server/src/application/participation-view-filter.ts',
    ],
    specPaths: [
      ...SCHEDULE_LIST_SPEC_PATHS,
      ...PREPARE_SPEC_PATHS,
      ...LEADER_AVAILABILITY_SPEC_PATHS,
    ],
  }),
  ...mapEach({
    paths: [
      'apps/server/src/application/db-participation-reader.ts',
      'apps/server/src/domain/contracts/application/participation-reader.ts',
    ],
    specPaths: [
      ...BUILDER_SPEC_PATHS,
      ...PREPARE_SPEC_PATHS,
      'tests/scheduling/us4-schedule-publish.spec.ts',
    ],
  }),
  // Usual setup is edited on the Ministry and read by Prepare.
  ...mapEach({
    paths: [
      'apps/server/src/application/db-usual-setup-manager.ts',
      'apps/server/src/domain/contracts/application/usual-setup-manager.ts',
      'apps/server/src/api/controllers/usual-setup-controller.ts',
      'apps/server/src/api/dtos/usual-setup.dto.ts',
    ],
    specPaths: [...MINISTRIES_JOURNEY_SPEC_PATHS, ...PREPARE_SPEC_PATHS],
  }),
  ...mapEach({
    paths: [
      'apps/server/src/domain/contracts/application/usual-setup-staffing-seeder.ts',
    ],
    specPaths: CYCLE_HANDOFF_SPEC_PATHS,
  }),
  ...mapEach({
    paths: [
      'apps/server/src/domain/contracts/application/availability-check-manager.ts',
      'apps/server/src/infrastructure/repositories/drizzle-availability-check.repository.types.ts',
    ],
    specPaths: LEADER_AVAILABILITY_SPEC_PATHS,
  }),
  // The live-Time-block filter of the participation and Availability reads.
  ...mapEach({
    paths: [
      'apps/server/src/infrastructure/repositories/live-event-time-block.ts',
    ],
    specPaths: [...PREPARE_SPEC_PATHS, ...LEADER_AVAILABILITY_SPEC_PATHS],
  }),
  ...mapEach({
    paths: [
      'apps/server/src/domain/contracts/application/volunteer-manager.ts',
    ],
    specPaths: [
      ...VOLUNTEER_AVAILABILITY_SPEC_PATHS,
      'tests/scheduling/us5-leader-reassign.spec.ts',
      ...NOTIFICATION_BELL_SPEC_PATHS,
      ...ADMIN_CANCEL_SPEC_PATHS,
    ],
  }),
  // #1253: the Schedule export and the Event groups it is split by. The
  // Typst templates are not production paths here; the server suites own them.
  ...mapEach({
    paths: [
      'apps/server/src/api/controllers/event-group-controller',
      'apps/server/src/api/controllers/schedule-export-controller',
      'apps/server/src/api/dtos/event-group.dto.ts',
      'apps/server/src/api/dtos/schedule-export.dto.ts',
      'apps/server/src/api/utils/schedule-export-render',
      'apps/server/src/application/db-event-group-manager.ts',
      'apps/server/src/application/db-schedule-export-reader.ts',
      'apps/server/src/domain/contracts/application/event-group-manager.ts',
      'apps/server/src/domain/contracts/application/schedule-export-reader.ts',
      'apps/server/src/domain/contracts/infrastructure/event-group.repository.ts',
      'apps/server/src/domain/contracts/infrastructure/schedule-export.repository.ts',
      'apps/server/src/domain/contracts/infrastructure/typst-renderer.ts',
      'apps/server/src/domain/errors/schedule-export.ts',
      'apps/server/src/domain/errors/typst-render.ts',
      'apps/server/src/infrastructure/repositories/drizzle-event-group.repository',
      'apps/server/src/infrastructure/repositories/drizzle-schedule-export.repository',
      'apps/server/src/infrastructure/typst/',
      'apps/web/src/features/ministries/components/event-groups-editor.tsx',
      'apps/web/src/features/scheduling/components/prepare/schedule-export',
      'apps/web/src/features/scheduling/hooks/use-schedule-export-files.ts',
      'apps/web/src/infrastructure/api/export.ts',
      'apps/web/src/routes/app/_active-church/ministries/$ministryId/event-groups.tsx',
    ],
    specPaths: SCHEDULE_EXPORT_SPEC_PATHS,
  }),
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
