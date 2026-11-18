import {
  type CalendarDay,
  compareCalendarDays,
  compareInstants,
  type Instant,
  today,
} from '@church/time';

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

/** A Shift has ended once its end time is not after now. */
export function hasShiftEnded({ shift, now }: ShiftEndedInput): boolean {
  return compareInstants({ left: shift.endTime, right: now }) <= 0;
}

/** The Volunteer can still change an answer only on an unpublished Shift that has not ended, in a check that is not read-only. */
export function isShiftAnswerable({
  readOnly,
  shift,
  now,
}: ShiftAnswerableInput): boolean {
  return !readOnly && !shift.published && !hasShiftEnded({ shift, now });
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

/** Groups a check's Shifts by the Church-local day they start on, keeping their order, and counts the days by state. */
export function groupCheckDays<TShift extends CheckDayShiftInput>({
  readOnly,
  shifts,
  now,
  timeZone,
}: GroupCheckDaysInput<TShift>): GroupedCheckDays<TShift> {
  const shiftsByDate = new Map<CalendarDay, CheckDay<TShift>['shifts']>();
  for (const shift of shifts) {
    const date = today({ instant: shift.startTime, timeZone });
    const dayShifts = shiftsByDate.get(date) ?? [];
    dayShifts.push({
      ...shift,
      answerable: isShiftAnswerable({ readOnly, shift, now }),
    });
    shiftsByDate.set(date, dayShifts);
  }

  const days = [...shiftsByDate]
    .sort(([left], [right]) => compareCalendarDays({ left, right }))
    .map(([date, dayShifts]): CheckDay<TShift> => {
      let state: CheckDayState = 'published';
      if (dayShifts.every((shift) => hasShiftEnded({ shift, now }))) {
        state = 'past';
      } else if (dayShifts.some((shift) => shift.answerable)) {
        state = 'open';
      }
      return { date, state, shifts: dayShifts };
    });

  const countDays = (state: CheckDayState) =>
    days.filter((day) => day.state === state).length;
  return {
    days,
    counts: {
      openDays: countDays('open'),
      pastDays: countDays('past'),
      publishedDays: countDays('published'),
      openShifts: days
        .flatMap((day) => day.shifts)
        .filter((shift) => shift.answerable).length,
    },
  };
}
