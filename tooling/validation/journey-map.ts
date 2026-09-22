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
];
