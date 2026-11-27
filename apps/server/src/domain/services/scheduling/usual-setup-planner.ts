import {
  compareInstants,
  parseCalendarDay,
  today,
  toInstant,
  toInstantAfter,
  toTimeOfDay,
} from '@church/time';
import type { UsualSetupHeadcount } from '../../entities/usual-setup';
import { computeEqualSpans } from './shift-splitter';
import type {
  PlanUsualSetupShiftsInput,
  ResolveManualSpansInput,
  SpansFitBlockInput,
  SplitFitsBlockInput,
  SumHeadcountsInput,
  UsualSetupNeedsReviewInput,
  UsualSetupShiftPlan,
  WallClockUtcBounds,
  WallClockUtcBoundsInput,
} from './usual-setup-planner.types';

/** Spans resolved after the block's own start, so an overnight span ends next day. */
function resolveManualSpans({
  spans,
  block,
  timeZone,
}: ResolveManualSpansInput) {
  const day = today({ instant: block.startTime, timeZone });
  const anchor = toTimeOfDay({ instant: block.startTime, timeZone });
  return spans.map((span) => ({
    label: span.label,
    startTime: toInstantAfter({ day, anchor, time: span.startTime, timeZone }),
    endTime: toInstantAfter({ day, anchor, time: span.endTime, timeZone }),
  }));
}

/** Positive, chronological, non-overlapping and inside the block; gaps and touching ends are ok. */
export function spansFitBlock({ spans, block }: SpansFitBlockInput): boolean {
  let previousEnd = block.startTime;
  for (const span of spans) {
    if (
      compareInstants({ left: span.endTime, right: span.startTime }) <= 0 ||
      compareInstants({ left: span.startTime, right: previousEnd }) < 0 ||
      compareInstants({ left: span.endTime, right: block.endTime }) > 0
    ) {
      return false;
    }
    previousEnd = span.endTime;
  }
  return true;
}

/**
 * The one validity rule shared by the review flag, the save and Send: an
 * equal split must tile the block; a manual one must satisfy `spansFitBlock`.
 */
export function splitFitsBlock({
  shiftSplit,
  block,
  timeZone,
}: SplitFitsBlockInput): boolean {
  if (shiftSplit.kind === 'equal') {
    try {
      computeEqualSpans({ ...block, n: shiftSplit.count });
      return true;
    } catch {
      return false;
    }
  }
  const spans = resolveManualSpans({
    spans: shiftSplit.spans,
    block,
    timeZone,
  });
  return spansFitBlock({ spans, block });
}

/** Template wall-clock bounds as Instants on a fixed UTC reference day. */
// Recurring TimeOfDay validity is wall-clock only: no date, so no DST.
export function wallClockUtcBounds({
  startTime,
  endTime,
}: WallClockUtcBoundsInput): WallClockUtcBounds {
  const timeZone = 'UTC';
  const day = parseCalendarDay({ value: '2000-01-03' });
  return {
    timeZone,
    block: {
      startTime: toInstant({ day, time: startTime, timeZone }),
      endTime: toInstantAfter({
        day,
        anchor: startTime,
        time: endTime,
        timeZone,
      }),
    },
  };
}

/** The single Shift of the whole-block fallback. */
const WHOLE_BLOCK_SHIFT_INDEX = 0;

/** Sums counts per Sector × Role across Shift indices; positive pairs only. */
function sumHeadcounts({
  headcounts,
  shiftIndex,
}: SumHeadcountsInput): UsualSetupHeadcount[] {
  const sums = new Map<string, UsualSetupHeadcount>();
  for (const { sectorId, roleId, peopleNeeded } of headcounts) {
    if (!(peopleNeeded > 0)) continue;
    const key = `${sectorId}:${roleId}`;
    const sum = sums.get(key);
    if (sum) sum.peopleNeeded += peopleNeeded;
    else sums.set(key, { shiftIndex, sectorId, roleId, peopleNeeded });
  }
  return [...sums.values()].sort(
    (left, right) =>
      left.sectorId.localeCompare(right.sectorId) ||
      left.roleId.localeCompare(right.roleId),
  );
}

/**
 * Shifts a serving entry seeds into an EventTimeBlock. A usable split is kept
 * as-is; otherwise one Shift spans the whole block carrying the summed counts.
 */
export function planUsualSetupShifts({
  shiftSplit,
  headcounts,
  block,
  timeZone,
}: PlanUsualSetupShiftsInput): UsualSetupShiftPlan {
  if (!splitFitsBlock({ shiftSplit, block, timeZone })) {
    return {
      fallback: true,
      shifts: [
        {
          ...block,
          headcounts: sumHeadcounts({
            headcounts,
            shiftIndex: WHOLE_BLOCK_SHIFT_INDEX,
          }),
        },
      ],
    };
  }
  const spans =
    shiftSplit.kind === 'equal'
      ? computeEqualSpans({ ...block, n: shiftSplit.count })
      : resolveManualSpans({ spans: shiftSplit.spans, block, timeZone });
  return {
    fallback: false,
    shifts: spans.map((span, shiftIndex) => ({
      ...span,
      headcounts: headcounts.filter((count) => count.shiftIndex === shiftIndex),
    })),
  };
}

/**
 * A serving manual split that no longer fits its Time block's current bounds.
 * `ministryNeedsReview` (infrastructure) answers the same rule in SQL for the
 * Ministry lists; the two must change together.
 */
export function usualSetupNeedsReview({
  entry,
  block,
}: UsualSetupNeedsReviewInput): boolean {
  return (
    entry?.serves === true &&
    entry.shiftSplit.kind === 'manual' &&
    !splitFitsBlock({
      shiftSplit: entry.shiftSplit,
      ...wallClockUtcBounds(block),
    })
  );
}
