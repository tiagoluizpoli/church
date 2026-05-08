import { format, parseISO } from 'date-fns';
import { formatInTimeZone, toDate } from 'date-fns-tz';

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
 * Gets the current browser timezone.
 */
export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
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
