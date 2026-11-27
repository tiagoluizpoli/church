import { today } from '@church/time';
import type { ShiftId } from '../../branded-ids';
import { CrossMinistryScopeError } from '../../errors/cross-ministry-scope';
import type {
  AssertUnavailableShiftsWithinScopeInput,
  ExpandWholeDayShiftIdsInput,
  ResolveShiftAvailabilityInput,
  ShiftAvailabilityResolution,
} from './unavailable-shifts.types';

/** Whole-day unavailability is a helper: one unavailable shift per shift starting on that church-local date (FR-018). */
export function expandWholeDayShiftIds({
  churchDate,
  timeZone,
  shifts,
}: ExpandWholeDayShiftIdsInput): ShiftId[] {
  return shifts
    .filter(
      (shift) => today({ instant: shift.startTime, timeZone }) === churchDate,
    )
    .map((shift) => shift.shiftId);
}

/** No unavailable shift ⇒ available (available-by-default, FR-018). */
export function resolveShiftAvailability({
  shiftIds,
  unavailableShiftIds,
}: ResolveShiftAvailabilityInput): ShiftAvailabilityResolution[] {
  const unavailable = new Set<ShiftId>(unavailableShiftIds);
  return shiftIds.map((shiftId) => ({
    shiftId,
    available: !unavailable.has(shiftId),
  }));
}

/** An unavailable shift may only target a shift inside the check's cycle + ministry membership (DL1-AV-04). */
export function assertUnavailableShiftsWithinScope({
  candidateShiftIds,
  requestedShiftIds,
}: AssertUnavailableShiftsWithinScopeInput): void {
  const candidates = new Set<ShiftId>(candidateShiftIds);
  for (const shiftId of requestedShiftIds) {
    if (!candidates.has(shiftId)) {
      throw new CrossMinistryScopeError();
    }
  }
}
