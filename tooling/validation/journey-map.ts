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
    sourcePathPrefix:
      'apps/web/src/routes/_authenticated/_active-church/scheduling',
    specPaths: [
      'tests/scheduling/smoke.spec.ts',
      'tests/scheduling/us4-roster-publish.spec.ts',
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
];
