import { formatInTimeZone } from 'date-fns-tz';
import type { ShiftId } from '../branded-ids';
import { CrossMinistryScopeError } from '../errors/cross-ministry-scope';

export interface WholeDayCandidateShift {
  shiftId: ShiftId;
  startTime: Date;
  endTime: Date;
}

export interface ExpandWholeDayShiftIdsInput {
  /** Church-local date, `yyyy-MM-dd`. */
  churchDate: string;
  timeZone: string;
  shifts: WholeDayCandidateShift[];
}

/** Whole-day marking is a helper: one mark per shift starting on that church-local date (FR-018). */
export function expandWholeDayShiftIds({
  churchDate,
  timeZone,
  shifts,
}: ExpandWholeDayShiftIdsInput): ShiftId[] {
  return shifts
    .filter(
      (shift) =>
        formatInTimeZone(shift.startTime, timeZone, 'yyyy-MM-dd') ===
        churchDate,
    )
    .map((shift) => shift.shiftId);
}

export interface ResolveShiftAvailabilityInput {
  shiftIds: ShiftId[];
  markedShiftIds: ShiftId[];
}

export interface ShiftAvailabilityResolution {
  shiftId: ShiftId;
  available: boolean;
}

/** Absence of a mark ⇒ available (available-by-default, FR-018). */
export function resolveShiftAvailability({
  shiftIds,
  markedShiftIds,
}: ResolveShiftAvailabilityInput): ShiftAvailabilityResolution[] {
  const marked = new Set<ShiftId>(markedShiftIds);
  return shiftIds.map((shiftId) => ({
    shiftId,
    available: !marked.has(shiftId),
  }));
}

export interface AssertMarksWithinScopeInput {
  candidateShiftIds: ShiftId[];
  requestedShiftIds: ShiftId[];
}

/** A mark may only target a shift inside the check's cycle + ministry membership (DL1-AV-04). */
export function assertMarksWithinScope({
  candidateShiftIds,
  requestedShiftIds,
}: AssertMarksWithinScopeInput): void {
  const candidates = new Set<ShiftId>(candidateShiftIds);
  for (const shiftId of requestedShiftIds) {
    if (!candidates.has(shiftId)) {
      throw new CrossMinistryScopeError();
    }
  }
}
