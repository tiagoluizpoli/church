import type { MinistryId, ShiftId } from '../branded-ids';

export interface OverlapCandidateShift {
  shiftId: ShiftId;
  ministryId: MinistryId;
  startTime: Date;
  endTime: Date;
}

export interface DetectCrossMinistryOverlapsInput {
  shifts: OverlapCandidateShift[];
}

export interface ShiftOverlapPair {
  first: OverlapCandidateShift;
  second: OverlapCandidateShift;
}

/**
 * Detects cross-ministry shift intersections by absolute timestamp
 * (CL-020: not date-truncated — midnight-crossing shifts compare correctly).
 * Touching edges are not an overlap; same-ministry intersections are ignored
 * (FR-020 flags cross-ministry conflicts only).
 */
export function detectCrossMinistryOverlaps({
  shifts,
}: DetectCrossMinistryOverlapsInput): ShiftOverlapPair[] {
  const pairs: ShiftOverlapPair[] = [];

  for (const [i, first] of shifts.entries()) {
    for (const second of shifts.slice(i + 1)) {
      if (first.ministryId === second.ministryId) continue;

      const intersects =
        first.startTime < second.endTime && second.startTime < first.endTime;
      if (intersects) {
        pairs.push({ first, second });
      }
    }
  }

  return pairs;
}
