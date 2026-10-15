import type { CalendarDay } from '@church/time';
import type {
  GetAvailabilityCheck200ShiftsItem,
  SetUnavailableShiftsBody,
} from '@/infrastructure/api/churchAPI.schemas';
import { dayOf } from '@/shared/utils/church-time';

export interface UnavailableShiftDraft {
  markedShiftIds: Set<string>;
  wholeDayDates: Set<string>;
}

export interface CreateInitialUnavailableShiftDraftInput {
  shifts: GetAvailabilityCheck200ShiftsItem[];
  timeZone: string;
}

export interface ToggleShiftUnavailableInput {
  draft: UnavailableShiftDraft;
  shifts: GetAvailabilityCheck200ShiftsItem[];
  shiftId: string;
  timeZone: string;
}

export interface ToggleWholeDayUnavailableInput {
  draft: UnavailableShiftDraft;
  shifts: GetAvailabilityCheck200ShiftsItem[];
  date: CalendarDay;
  timeZone: string;
}

export interface BuildUnavailableShiftsBodyInput {
  draft: UnavailableShiftDraft;
}

interface ShiftsOnDateInput {
  shifts: GetAvailabilityCheck200ShiftsItem[];
  date: CalendarDay;
  timeZone: string;
}

interface IsWholeDateMarkedInput {
  shifts: GetAvailabilityCheck200ShiftsItem[];
  date: CalendarDay;
  markedShiftIds: Set<string>;
  timeZone: string;
}

export interface GetShiftDateInput {
  shift: GetAvailabilityCheck200ShiftsItem;
  timeZone: string;
}

/** A shift belongs to the Church-Timezone day it starts on (ADR-0003). */
export function getShiftDate({
  shift,
  timeZone,
}: GetShiftDateInput): CalendarDay {
  return dayOf({ value: shift.startTime, timeZone });
}

function shiftsOnDate({
  shifts,
  date,
  timeZone,
}: ShiftsOnDateInput): GetAvailabilityCheck200ShiftsItem[] {
  return shifts.filter((shift) => getShiftDate({ shift, timeZone }) === date);
}

function isWholeDateMarked({
  shifts,
  date,
  markedShiftIds,
  timeZone,
}: IsWholeDateMarkedInput): boolean {
  const dateShifts = shiftsOnDate({ shifts, date, timeZone });
  return (
    dateShifts.length > 0 &&
    dateShifts.every((shift) => markedShiftIds.has(shift.shiftId))
  );
}

export function createInitialUnavailableShiftDraft({
  shifts,
  timeZone,
}: CreateInitialUnavailableShiftDraftInput): UnavailableShiftDraft {
  const markedShiftIds = new Set(
    shifts.filter((shift) => !shift.available).map((shift) => shift.shiftId),
  );
  const dates = new Set(
    shifts.map((shift) => getShiftDate({ shift, timeZone })),
  );
  const wholeDayDates = new Set(
    [...dates].filter((date) =>
      isWholeDateMarked({ shifts, date, markedShiftIds, timeZone }),
    ),
  );

  return { markedShiftIds, wholeDayDates };
}

export function toggleShiftUnavailable({
  draft,
  shifts,
  shiftId,
  timeZone,
}: ToggleShiftUnavailableInput): UnavailableShiftDraft {
  const shift = shifts.find((candidate) => candidate.shiftId === shiftId);
  if (!shift) return draft;

  const markedShiftIds = new Set(draft.markedShiftIds);
  if (markedShiftIds.has(shiftId)) {
    markedShiftIds.delete(shiftId);
  } else {
    markedShiftIds.add(shiftId);
  }

  const date = getShiftDate({ shift, timeZone });
  const wholeDayDates = new Set(draft.wholeDayDates);
  if (isWholeDateMarked({ shifts, date, markedShiftIds, timeZone })) {
    wholeDayDates.add(date);
  } else {
    wholeDayDates.delete(date);
  }

  return { markedShiftIds, wholeDayDates };
}

export function toggleWholeDayUnavailable({
  draft,
  shifts,
  date,
  timeZone,
}: ToggleWholeDayUnavailableInput): UnavailableShiftDraft {
  const dateShifts = shiftsOnDate({ shifts, date, timeZone });
  const markedShiftIds = new Set(draft.markedShiftIds);
  const wholeDayDates = new Set(draft.wholeDayDates);
  const turningOn = !wholeDayDates.has(date);

  for (const shift of dateShifts) {
    if (turningOn) {
      markedShiftIds.add(shift.shiftId);
    } else {
      markedShiftIds.delete(shift.shiftId);
    }
  }

  if (turningOn) {
    wholeDayDates.add(date);
  } else {
    wholeDayDates.delete(date);
  }

  return { markedShiftIds, wholeDayDates };
}

export function buildUnavailableShiftsBody({
  draft,
}: BuildUnavailableShiftsBodyInput): SetUnavailableShiftsBody {
  return {
    shiftIds: [...draft.markedShiftIds],
    wholeDayDates: [...draft.wholeDayDates],
  };
}
