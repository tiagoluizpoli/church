import type { CalendarDay } from '@church/time';
import type {
  GetAvailabilityCheck200ShiftsItem,
  SetUnavailabilityMarksBody,
} from '@/infrastructure/api/churchAPI.schemas';
import { dayOf } from '@/shared/utils/church-time';

export interface AvailabilityMarkDraft {
  markedShiftIds: Set<string>;
  wholeDayDates: Set<string>;
}

export interface CreateInitialMarkDraftInput {
  shifts: GetAvailabilityCheck200ShiftsItem[];
  timeZone: string;
}

export interface ToggleShiftMarkInput {
  draft: AvailabilityMarkDraft;
  shifts: GetAvailabilityCheck200ShiftsItem[];
  shiftId: string;
  timeZone: string;
}

export interface ToggleWholeDayMarkInput {
  draft: AvailabilityMarkDraft;
  shifts: GetAvailabilityCheck200ShiftsItem[];
  date: string;
  timeZone: string;
}

export interface BuildMarksBodyInput {
  draft: AvailabilityMarkDraft;
}

interface ShiftsOnDateInput {
  shifts: GetAvailabilityCheck200ShiftsItem[];
  date: string;
  timeZone: string;
}

interface IsWholeDateMarkedInput {
  shifts: GetAvailabilityCheck200ShiftsItem[];
  date: string;
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

export function createInitialMarkDraft({
  shifts,
  timeZone,
}: CreateInitialMarkDraftInput): AvailabilityMarkDraft {
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

export function toggleShiftMark({
  draft,
  shifts,
  shiftId,
  timeZone,
}: ToggleShiftMarkInput): AvailabilityMarkDraft {
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

export function toggleWholeDayMark({
  draft,
  shifts,
  date,
  timeZone,
}: ToggleWholeDayMarkInput): AvailabilityMarkDraft {
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

export function buildMarksBody({
  draft,
}: BuildMarksBodyInput): SetUnavailabilityMarksBody {
  return {
    shiftIds: [...draft.markedShiftIds],
    wholeDayDates: [...draft.wholeDayDates],
  };
}
