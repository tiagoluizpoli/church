import { formatInTimeZone } from 'date-fns-tz';
import {
  calendarDaysBetween,
  minutesBetween,
  weekdayIndex,
} from './arithmetic';
import type { CalendarDay, Instant, TimeOfDay } from './brands';
import { now } from './clock';
import { today, toTimeOfDay } from './conversion';
import { toDate } from './persistence';
import { assertTimeZone } from './time-zone';

// English words only: this is the seam's one authored presentation, not a
// locale layer. No format/options/locale parameter belongs on any export here.
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export interface CalendarDayFormatInput {
  day: CalendarDay;
}

/** `dd/MM/yyyy`. */
export function formatCalendarDay({ day }: CalendarDayFormatInput): string {
  const [year, month, dayOfMonth] = day.split('-');
  return `${dayOfMonth}/${month}/${year}`;
}

/** `Monday, 04/01/2027`. */
export function formatCalendarDayWithWeekday({
  day,
}: CalendarDayFormatInput): string {
  return `${formatWeekday({ day })}, ${formatCalendarDay({ day })}`;
}

/** `Monday`. */
export function formatWeekday({ day }: CalendarDayFormatInput): string {
  // weekdayIndex is always 0-6 for a valid CalendarDay.
  return WEEKDAYS[weekdayIndex({ day }) as 0 | 1 | 2 | 3 | 4 | 5 | 6];
}

/** `04/01`. */
export function formatDayAndMonth({ day }: CalendarDayFormatInput): string {
  const [, month, dayOfMonth] = day.split('-');
  return `${dayOfMonth}/${month}`;
}

export interface TimeOfDayFormatInput {
  time: TimeOfDay;
}

/** `14:30`. A TimeOfDay is already `HH:mm`; this is the seam's naming of it. */
export function formatTimeOfDay({ time }: TimeOfDayFormatInput): string {
  return time;
}

export interface InstantFormatInput {
  instant: Instant;
  timeZone: string;
}

/** `04/01/2027 14:30`, read on the Church Timezone's wall clock. */
export function formatInstant({
  instant,
  timeZone,
}: InstantFormatInput): string {
  const day = today({ instant, timeZone });
  const time = toTimeOfDay({ instant, timeZone });
  return `${formatCalendarDay({ day })} ${formatTimeOfDay({ time })}`;
}

/** `04/01/2027 14:30:05`. Seconds only; never milliseconds. */
export function formatInstantPrecise({
  instant,
  timeZone,
}: InstantFormatInput): string {
  assertTimeZone({ timeZone });
  return formatInTimeZone(toDate({ instant }), timeZone, 'dd/MM/yyyy HH:mm:ss');
}

function daysFromNow({ instant, timeZone }: InstantFormatInput): number {
  const nowDay = today({ instant: now(), timeZone });
  const day = today({ instant, timeZone });
  return calendarDaysBetween({ start: nowDay, end: day });
}

interface RelativeDayPhraseInput {
  dayDiff: number;
}

function relativeDayPhrase({ dayDiff }: RelativeDayPhraseInput): string {
  if (dayDiff === 0) return 'today';
  if (dayDiff === 1) return 'tomorrow';
  if (dayDiff === -1) return 'yesterday';
  return dayDiff > 0 ? `in ${dayDiff} days` : `${-dayDiff} days ago`;
}

/**
 * `today` / `tomorrow` / `yesterday` / `in N days` / `N days ago`, by
 * CalendarDay distance from `now()` in the Church Timezone.
 */
export function formatRelative({
  instant,
  timeZone,
}: InstantFormatInput): string {
  return relativeDayPhrase({ dayDiff: daysFromNow({ instant, timeZone }) });
}

/**
 * Relative phrasing (as `formatRelative`) while the CalendarDay distance from
 * `now()` is under 7 days in either direction; the absolute CalendarDay once
 * it reaches 7.
 */
export function formatRecency({
  instant,
  timeZone,
}: InstantFormatInput): string {
  const dayDiff = daysFromNow({ instant, timeZone });
  if (Math.abs(dayDiff) < 7) return relativeDayPhrase({ dayDiff });
  return formatCalendarDay({ day: today({ instant, timeZone }) });
}

export interface Span {
  durationMinutes: number;
  crossesToNextDay: boolean;
}

export interface TimeOfDaySpanInput {
  start: TimeOfDay;
  end: TimeOfDay;
}

const MINUTES_PER_DAY = 24 * 60;

interface TimeOfDayMinutesInput {
  time: TimeOfDay;
}

function timeOfDayMinutes({ time }: TimeOfDayMinutesInput): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Duration and midnight-crossing for a wall-clock TimeBlock pair: an end
 * earlier than its start crosses onto the next CalendarDay, per `CONTEXT.md`. */
export function timeOfDaySpan({ start, end }: TimeOfDaySpanInput): Span {
  const startMinutes = timeOfDayMinutes({ time: start });
  const endMinutes = timeOfDayMinutes({ time: end });
  const crossesToNextDay = endMinutes < startMinutes;
  const durationMinutes = crossesToNextDay
    ? MINUTES_PER_DAY - startMinutes + endMinutes
    : endMinutes - startMinutes;
  return { durationMinutes, crossesToNextDay };
}

export interface InstantSpanInput {
  start: Instant;
  end: Instant;
  timeZone: string;
}

/** Duration and midnight-crossing for an Instant pair, judged by the
 * CalendarDay each endpoint falls on in the Church Timezone. */
export function instantSpan({ start, end, timeZone }: InstantSpanInput): Span {
  const durationMinutes = minutesBetween({ start, end });
  const crossesToNextDay =
    today({ instant: start, timeZone }) !== today({ instant: end, timeZone });
  return { durationMinutes, crossesToNextDay };
}
