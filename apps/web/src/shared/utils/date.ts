/** A calendar day, `yyyy-MM-dd`, carrying no time and no offset. */
export type CalendarDayKey = string;

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
