import { format, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toDate } from 'date-fns-tz';

/**
 * Formats a date in a specific timezone.
 * Useful for displaying "Church Time".
 */
export function formatInTZ(
  date: Date | string | number,
  timeZone: string,
  formatStr = 'PPpp',
): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatInTimeZone(d, timeZone, formatStr);
}

/**
 * Converts a UTC date to a specific timezone's local time object.
 */
export function toTZ(date: Date | string | number, timeZone: string): Date {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return toDate(d, { timeZone });
}

/**
 * Converts a wall-clock time (as understood in the given timezone) to the
 * equivalent UTC instant. Inverse of `toTZ`/`formatInTZ`.
 */
export function fromTZ(wallClock: string, timeZone: string): Date {
  return fromZonedTime(wallClock, timeZone);
}

/**
 * Gets the current browser timezone.
 */
export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** A calendar day, `yyyy-MM-dd`, carrying no time and no offset. */
export type CalendarDayKey = string;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Calendar day an instant falls on, read in the viewer's timezone.
 *
 * Use this for values that carry a real wall-clock time — event bounds, slot and
 * shift times. They are stored as church-local wall clock in `timestamptz`, so a
 * one-day event runs local midnight → local 23:59 and a 9pm slot sits near the
 * following UTC date. Slicing the UTC prefix off such a value reports the wrong
 * day at any non-zero offset: west of UTC it reads a day late, east of UTC a day
 * early.
 *
 * Values already in `yyyy-MM-dd` form pass through untouched — they are days,
 * not instants, and `new Date('2027-01-04')` would parse them at UTC midnight
 * and shift them a day west of UTC.
 */
export function toLocalDayKey(value: string): CalendarDayKey {
  if (DATE_ONLY_PATTERN.test(value)) return value;
  const instant = new Date(value);
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;
}

/**
 * Calendar day of a date-only value.
 *
 * Use this for values that name a day rather than a moment — planning-cycle
 * bounds, which are anchored at UTC midnight (`2027-01-01T00:00:00.000Z` means
 * "January 1"). Reading those in the viewer's timezone would drag them back a
 * day west of UTC.
 */
export function toCycleDayKey(value: string): CalendarDayKey {
  return value.slice(0, 10);
}

/**
 * Formats a date in the user's local timezone.
 */
export function formatLocal(
  date: Date | string | number,
  formatStr = 'PPpp',
): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
}
