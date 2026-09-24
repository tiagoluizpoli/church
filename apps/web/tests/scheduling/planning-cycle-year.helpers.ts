/**
 * E2E specs that create planning cycles each need a year no other spec file
 * (or call site within a file) can land on, or the backend's overlap guard
 * rejects the create with `409 OVERLAPPING_CYCLE` (#241). Every call site
 * that seeds a cycle registers itself here with its own non-overlapping
 * 50-year band, then derives its actual year from a per-run time bucket
 * inside that band — this keeps the existing "randomize per run so leftover
 * data from a previous run doesn't collide" property, while making
 * cross-file collisions structurally impossible instead of merely unlikely.
 *
 * To add a new cycle-creating call site: append its id to `CALL_SITE_IDS`
 * (order doesn't matter, but never remove or reorder existing entries — that
 * would reassign every band after it) and call `allocatedYear` with that id.
 */
const YEAR_BAND_SIZE = 50;
const YEAR_BAND_START = 2100;

const CALL_SITE_IDS = [
  'planning-cycles-table-view:create-cycle-with-sunday-template',
  'planning-cycles-table-view:us3-edit-delete',
  'us1-admin-plan:create-planning-month',
  'us2-leader-tailor:create-planning-month',
  'us3-volunteer-availability:create-overlap-planning-month',
  'single-create-event-ui:ensure-unlocked-cycle-selected',
  'single-create-event-ui:calendar-day-timezone',
  'us5-live-changes:create-live-changes-month',
  'planning-nav-restructure:distinct-addressable-urls',
  'cross-cutting:x2-network-failure',
  'cross-cutting:x3-double-submit',
] as const;

export type PlanningCycleYearCallSiteId = (typeof CALL_SITE_IDS)[number];

function yearBandBase(callSiteId: PlanningCycleYearCallSiteId): number {
  const index = CALL_SITE_IDS.indexOf(callSiteId);
  return YEAR_BAND_START + index * YEAR_BAND_SIZE;
}

/**
 * A year within `callSiteId`'s dedicated band, time-bucketed so repeated
 * runs (within the same second) still land on the same year, while later
 * runs pick a different one in the band.
 */
export function allocatedYear(callSiteId: PlanningCycleYearCallSiteId): number {
  return (
    yearBandBase(callSiteId) + (Math.floor(Date.now() / 1000) % YEAR_BAND_SIZE)
  );
}

/**
 * For call sites that seed several cycles sequentially within one run (e.g.
 * one per test in a file): a time-bucketed offset within the reserved slice
 * of the band, plus a strictly increasing sequence number, so every cycle
 * created in the same run gets its own year deterministically rather than
 * probabilistically. `reserveForSequence` must exceed the max number of
 * cycles the call site creates in a single run.
 */
export function allocatedYearSequence(
  callSiteId: PlanningCycleYearCallSiteId,
  reserveForSequence: number,
): () => number {
  const runOffset = Math.floor(
    Math.random() * (YEAR_BAND_SIZE - reserveForSequence),
  );
  const base = yearBandBase(callSiteId) + runOffset;
  let sequence = 0;
  return () => base + sequence++;
}
