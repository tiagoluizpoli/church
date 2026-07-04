import type {
  GetAvailabilityCheck200ShiftsItem,
  SetUnavailabilityMarksBody,
} from '@/infrastructure/api/churchAPI.schemas';

export interface AvailabilityMarkDraft {
  markedShiftIds: Set<string>;
  wholeDayDates: Set<string>;
}

export interface CreateInitialMarkDraftInput {
  shifts: GetAvailabilityCheck200ShiftsItem[];
}

export interface ToggleShiftMarkInput {
  draft: AvailabilityMarkDraft;
  shifts: GetAvailabilityCheck200ShiftsItem[];
  shiftId: string;
}

export interface ToggleWholeDayMarkInput {
  draft: AvailabilityMarkDraft;
  shifts: GetAvailabilityCheck200ShiftsItem[];
  date: string;
}

export interface BuildMarksBodyInput {
  draft: AvailabilityMarkDraft;
}

interface ShiftsOnDateInput {
  shifts: GetAvailabilityCheck200ShiftsItem[];
  date: string;
}

interface IsWholeDateMarkedInput {
  shifts: GetAvailabilityCheck200ShiftsItem[];
  date: string;
  markedShiftIds: Set<string>;
}

export function getShiftDate(shift: GetAvailabilityCheck200ShiftsItem): string {
  return shift.startTime.slice(0, 10);
}

function shiftsOnDate({
  shifts,
  date,
}: ShiftsOnDateInput): GetAvailabilityCheck200ShiftsItem[] {
  return shifts.filter((shift) => getShiftDate(shift) === date);
}

function isWholeDateMarked({
  shifts,
  date,
  markedShiftIds,
}: IsWholeDateMarkedInput): boolean {
  const dateShifts = shiftsOnDate({ shifts, date });
  return (
    dateShifts.length > 0 &&
    dateShifts.every((shift) => markedShiftIds.has(shift.shiftId))
  );
}

export function createInitialMarkDraft({
  shifts,
}: CreateInitialMarkDraftInput): AvailabilityMarkDraft {
  const markedShiftIds = new Set(
    shifts.filter((shift) => !shift.available).map((shift) => shift.shiftId),
  );
  const dates = new Set(shifts.map((shift) => getShiftDate(shift)));
  const wholeDayDates = new Set(
    [...dates].filter((date) =>
      isWholeDateMarked({ shifts, date, markedShiftIds }),
    ),
  );

  return { markedShiftIds, wholeDayDates };
}

export function toggleShiftMark({
  draft,
  shifts,
  shiftId,
}: ToggleShiftMarkInput): AvailabilityMarkDraft {
  const shift = shifts.find((candidate) => candidate.shiftId === shiftId);
  if (!shift) return draft;

  const markedShiftIds = new Set(draft.markedShiftIds);
  if (markedShiftIds.has(shiftId)) {
    markedShiftIds.delete(shiftId);
  } else {
    markedShiftIds.add(shiftId);
  }

  const date = getShiftDate(shift);
  const wholeDayDates = new Set(draft.wholeDayDates);
  if (isWholeDateMarked({ shifts, date, markedShiftIds })) {
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
}: ToggleWholeDayMarkInput): AvailabilityMarkDraft {
  const dateShifts = shiftsOnDate({ shifts, date });
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
