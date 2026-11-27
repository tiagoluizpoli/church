import type { CalendarDay, Instant } from '@church/time';
import type { ShiftId } from '../../branded-ids';

export interface WholeDayCandidateShift {
  shiftId: ShiftId;
  startTime: Instant;
  endTime: Instant;
}

export interface ExpandWholeDayShiftIdsInput {
  churchDate: CalendarDay;
  timeZone: string;
  shifts: WholeDayCandidateShift[];
}

export interface ResolveShiftAvailabilityInput {
  shiftIds: ShiftId[];
  unavailableShiftIds: ShiftId[];
}

export interface ShiftAvailabilityResolution {
  shiftId: ShiftId;
  available: boolean;
}

export interface AssertUnavailableShiftsWithinScopeInput {
  candidateShiftIds: ShiftId[];
  requestedShiftIds: ShiftId[];
}
