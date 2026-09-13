import type { CalendarDay, Instant } from './brands';
import { fromDate } from './persistence';
import { DAY_MS, MINUTE_MS, utcMidnightOf } from './utc-calendar';

export interface AddMinutesInput {
  instant: Instant;
  minutes: number;
}

export function addMinutes({ instant, minutes }: AddMinutesInput): Instant {
  return addMilliseconds({ instant, milliseconds: minutes * MINUTE_MS });
}

export interface InstantRangeInput {
  start: Instant;
  end: Instant;
}

/** Whole minutes from `start` to `end`, truncated toward zero; negative when
 * `end` is earlier. */
export function minutesBetween({ start, end }: InstantRangeInput): number {
  const minutes = millisecondsBetween({ start, end }) / MINUTE_MS;
  // `+ 0` turns the `-0` a sub-minute negative span truncates to into `0`.
  return Math.trunc(minutes) + 0;
}

export interface AddCalendarDaysInput {
  day: CalendarDay;
  days: number;
}

export function addCalendarDays({
  day,
  days,
}: AddCalendarDaysInput): CalendarDay {
  const date = utcMidnightOf({ day });
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10) as CalendarDay;
}

export interface CalendarDayRangeInput {
  start: CalendarDay;
  end: CalendarDay;
}

/** Every CalendarDay from `start` to `end` inclusive; empty when reversed. */
export function enumerateCalendarDays({
  start,
  end,
}: CalendarDayRangeInput): CalendarDay[] {
  const days: CalendarDay[] = [];
  for (let day = start; day <= end; day = addCalendarDays({ day, days: 1 })) {
    days.push(day);
  }
  return days;
}

export interface WeekdayIndexInput {
  day: CalendarDay;
}

/** 0 (Sunday) … 6 (Saturday). */
export function weekdayIndex({ day }: WeekdayIndexInput): number {
  return utcMidnightOf({ day }).getUTCDay();
}

export interface AddMillisecondsInput {
  instant: Instant;
  milliseconds: number;
}

export function addMilliseconds({
  instant,
  milliseconds,
}: AddMillisecondsInput): Instant {
  return fromDate({ date: new Date(Date.parse(instant) + milliseconds) });
}

/** Milliseconds from `start` to `end`; negative when `end` is earlier. */
export function millisecondsBetween({ start, end }: InstantRangeInput): number {
  return Date.parse(end) - Date.parse(start);
}

/** Whole CalendarDays from `start` to `end`; negative when `end` is earlier. */
export function calendarDaysBetween({
  start,
  end,
}: CalendarDayRangeInput): number {
  return Math.round(
    (utcMidnightOf({ day: end }).getTime() -
      utcMidnightOf({ day: start }).getTime()) /
      DAY_MS,
  );
}
