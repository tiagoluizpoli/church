/**
 * E2E specs that create planning cycles each need a year no other spec file,
 * call site, or parallel worker can land on, or the backend's overlap guard
 * rejects the create with `409 OVERLAPPING_CYCLE` (#241). Every call site
 * that seeds a cycle registers itself here with its own non-overlapping
 * 50-year band. Workers share one server and DB, so a band is carved into
 * one disjoint slice per worker, picked by `test.info().parallelIndex`
 * (unique among concurrently running workers, reused when one restarts).
 *
 * Inside its slice a worker hands out consecutive years from a random start,
 * wrapping around the slice. The cursor lives in a file in the run's output
 * directory, not in module state, so a worker restarted after a failure (or
 * for a retry or `--repeat-each`) continues after the years its predecessor
 * used instead of starting over: a slice yields `size` distinct years per
 * run. Playwright empties the output directory at the start of every run,
 * and setup resets the E2E database, so each run starts fresh.
 *
 * Slices are resolved lazily, at call time inside a test, because
 * `test.info()` throws outside one.
 *
 * To add a new cycle-creating call site: append its id to `CALL_SITE_IDS`
 * (order doesn't matter, but never remove or reorder existing entries — that
 * would reassign every band after it) and call `allocatedYear` with that id.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';

const YEAR_BAND_SIZE = 50;
const YEAR_BAND_START = 2100;

export const CALL_SITE_IDS = [
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

interface YearSliceParams {
  callSiteId: PlanningCycleYearCallSiteId;
  parallelIndex: number;
  workers: number;
}

interface YearSlice {
  start: number;
  size: number;
}

/**
 * The years worker `parallelIndex` owns within `callSiteId`'s band:
 * `[start, start + size)`. Slices of different workers never overlap.
 */
export function yearSlice({
  callSiteId,
  parallelIndex,
  workers,
}: YearSliceParams): YearSlice {
  const size = Math.floor(YEAR_BAND_SIZE / workers);
  return { start: yearBandBase(callSiteId) + parallelIndex * size, size };
}

interface NextYearInSliceParams {
  callSiteId: PlanningCycleYearCallSiteId;
  reserve: number;
}

function nextYearInSlice({
  callSiteId,
  reserve,
}: NextYearInSliceParams): number {
  const { parallelIndex, config, project } = test.info();
  const { workers } = config;
  const { start, size } = yearSlice({ callSiteId, parallelIndex, workers });
  if (reserve > size) {
    throw new Error(
      `Planning-cycle year call site "${callSiteId}" needs ${reserve} distinct years per worker, but a worker slice is ${size} years (${YEAR_BAND_SIZE}-year band / ${workers} workers); run fewer workers.`,
    );
  }

  const cursorFile = path.join(
    project.outputDir,
    '.planning-cycle-years',
    `${callSiteId.replace(':', '--')}-${parallelIndex}`,
  );
  let cursor: number;
  try {
    cursor = Number(readFileSync(cursorFile, 'utf8'));
  } catch {
    cursor = Math.floor(Math.random() * size);
  }
  mkdirSync(path.dirname(cursorFile), { recursive: true });
  writeFileSync(cursorFile, String(cursor + 1));
  return start + (cursor % size);
}

interface AllocatedYearParams {
  callSiteId: PlanningCycleYearCallSiteId;
}

/**
 * A year within this worker's slice of `callSiteId`'s band that no earlier
 * call this run (from this worker or a restarted one) got. Must be called
 * inside a test.
 */
export function allocatedYear({ callSiteId }: AllocatedYearParams): number {
  return nextYearInSlice({ callSiteId, reserve: 1 });
}

interface AllocatedYearSequenceParams {
  callSiteId: PlanningCycleYearCallSiteId;
  reserveForSequence: number;
}

/**
 * For call sites that seed several cycles (e.g. one per test in a file): each
 * call returns a year no earlier call this run got. `reserveForSequence` is
 * the most cycles the call site creates within ONE worker; it must fit in a
 * worker's slice, or the call throws (too many workers). Each call must run
 * inside a test.
 */
export function allocatedYearSequence({
  callSiteId,
  reserveForSequence,
}: AllocatedYearSequenceParams): () => number {
  return () => nextYearInSlice({ callSiteId, reserve: reserveForSequence });
}
