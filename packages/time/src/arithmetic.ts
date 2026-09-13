import type { CalendarDay, Instant } from './brands';
import { fromDate } from './persistence';

const MINUTE_MS = 60_000;

function dayAtUtcMidnight(day: CalendarDay): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export interface AddMinutesInput {
  instant: Instant;
  minutes: number;
}

export function addMinutes({ instant, minutes }: AddMinutesInput): Instant {
  return fromDate({
    date: new Date(Date.parse(instant) + minutes * MINUTE_MS),
  });
}

export interface InstantRangeInput {
  start: Instant;
  end: Instant;
}

/** Whole minutes from `start` to `end`; negative when `end` is earlier. */
export function minutesBetween({ start, end }: InstantRangeInput): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / MINUTE_MS);
}

export interface AddCalendarDaysInput {
  day: CalendarDay;
  days: number;
}

export function addCalendarDays({
  day,
  days,
}: AddCalendarDaysInput): CalendarDay {
  const date = dayAtUtcMidnight(day);
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
  return dayAtUtcMidnight(day).getUTCDay();
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole CalendarDays from `start` to `end`; negative when `end` is earlier. */
export function calendarDaysBetween({
  start,
  end,
}: CalendarDayRangeInput): number {
  return Math.round(
    (dayAtUtcMidnight(end).getTime() - dayAtUtcMidnight(start).getTime()) /
      DAY_MS,
  );
}
