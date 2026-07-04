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

  for (let i = 0; i < shifts.length; i += 1) {
    for (let j = i + 1; j < shifts.length; j += 1) {
      const first = shifts[i];
      const second = shifts[j];
      if (!first || !second) continue;
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
