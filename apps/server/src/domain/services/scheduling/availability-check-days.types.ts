import type { CalendarDay, Instant } from '@church/time';

export interface CheckDayShiftInput {
  published: boolean;
  startTime: Instant;
  endTime: Instant;
}

export interface ShiftAnswerableInput {
  readOnly: boolean;
  shift: CheckDayShiftInput;
  now: Instant;
}

export interface ShiftEndedInput {
  shift: CheckDayShiftInput;
  now: Instant;
}

export type CheckDayState = 'open' | 'past' | 'published';

export interface CheckDay<TShift> {
  date: CalendarDay;
  state: CheckDayState;
  shifts: (TShift & { answerable: boolean })[];
}

export interface CheckDayCounts {
  openDays: number;
  pastDays: number;
  publishedDays: number;
  openShifts: number;
}

export interface GroupCheckDaysInput<TShift extends CheckDayShiftInput> {
  readOnly: boolean;
  shifts: TShift[];
  now: Instant;
  timeZone: string;
}

export interface GroupedCheckDays<TShift> {
  days: CheckDay<TShift>[];
  counts: CheckDayCounts;
}
