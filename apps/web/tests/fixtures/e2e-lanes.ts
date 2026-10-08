import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every Playwright spec runs in the `isolated` lane, in parallel. Workers
 * share the run's single server, Vite and E2E database (ADR-0005), so a spec
 * listed here writes only data no other spec reads: a mutating journey loads
 * its own recreatable recipe graph, and the suite's shared personas stay
 * read-only (#320).
 *
 * A spec missing from the list, listed twice, or listed but absent fails the
 * config load, so a new spec is classified deliberately.
 */
export const ISOLATED_SPECS = [
  'identity/active-church-switching.spec.ts',
  'identity/cross-tenant-invitation-isolation.spec.ts',
  'identity/redemption-existing-member.spec.ts',
  'identity/redemption-new-user.spec.ts',
  'identity/route-protection.spec.ts',
  'identity/volunteer-transfer-journey.spec.ts',
  'scheduling/a11y-planning-nav.spec.ts',
  'scheduling/capability-index.spec.ts',
  'scheduling/cross-cutting.spec.ts',
  'scheduling/overnight-time-block.spec.ts',
  'scheduling/planning-cross-tenant-isolation.spec.ts',
  'scheduling/planning-cycles-table-view.spec.ts',
  'scheduling/planning-nav-restructure.spec.ts',
  'scheduling/planning-role-guard-matrix.spec.ts',
  'scheduling/single-create-event-ui.spec.ts',
  'scheduling/us1-admin-plan.spec.ts',
  // Journey recipes (#327, #329): each test loads its own Church, personas
  // and schedule.
  'scheduling/a11y-builder.spec.ts',
  'scheduling/builder-slot-focus.spec.ts',
  'scheduling/qualification.spec.ts',
  'scheduling/smoke.spec.ts',
  'scheduling/us2-leader-tailor.spec.ts',
  'scheduling/us3-volunteer-availability.spec.ts',
  'scheduling/us4-roster-publish.spec.ts',
  'scheduling/us5-live-changes.spec.ts',
  'volunteer-dashboard/us-notification-bell.spec.ts',
  'volunteer-dashboard/us1-availability.spec.ts',
  'volunteer-dashboard/us2-assignments.spec.ts',
  'volunteer-dashboard/us4-ministry-schedule.spec.ts',
  'volunteer-dashboard/us5-offline.spec.ts',
] as const;

export const E2E_TEST_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const SPEC_FILE = /\.spec\.ts$/;

interface LaneTestMatchParams {
  specs: readonly string[];
}

/**
 * `testMatch` patterns for a lane's specs: each matches the file's path
 * below `testDir` as a whole path suffix, so it holds whichever absolute
 * path (symlinked or not) Playwright resolves the test directory to.
 */
export function laneTestMatch({ specs }: LaneTestMatchParams): RegExp[] {
  return specs.map(
    (spec) => new RegExp(`/${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
  );
}

interface FindSpecFilesParams {
  testDir: string;
}

function findSpecFiles({ testDir }: FindSpecFilesParams): string[] {
  return readdirSync(testDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => SPEC_FILE.test(file))
    .map((file) => file.split(path.sep).join('/'));
}

interface AssertEveryE2eSpecHasOneLaneParams {
  testDir: string;
  isolatedSpecs: readonly string[];
}

export function assertEveryE2eSpecHasOneLane({
  testDir,
  isolatedSpecs,
}: AssertEveryE2eSpecHasOneLaneParams): void {
  const onDisk = new Set(findSpecFiles({ testDir }));
  const classified = isolatedSpecs;
  const problems = [
    ...[...onDisk]
      .filter((spec) => !classified.includes(spec))
      .map((spec) => `unclassified: ${spec}`),
    ...classified
      .filter((spec, index) => classified.indexOf(spec) !== index)
      .map((spec) => `listed more than once: ${spec}`),
    ...classified
      .filter((spec) => !onDisk.has(spec))
      .map((spec) => `listed but not found: ${spec}`),
  ];

  if (problems.length > 0) {
    throw new Error(
      `E2E lanes (tests/fixtures/e2e-lanes.ts) must list every spec exactly once:\n  ${problems.join('\n  ')}`,
    );
  }
}
