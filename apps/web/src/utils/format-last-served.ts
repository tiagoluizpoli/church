import {
  calendarDaysBetween,
  isInstant,
  now,
  parseInstant,
  today,
} from '@church/time';

export interface FormatLastServedInput {
  /** ISO instant of the volunteer's most recent serving assignment. */
  lastServedAt?: string;
  /** Days are counted on the Church Timezone's calendar. */
  timeZone: string;
}

const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
/** Past two months, weeks stop being the unit a leader thinks in. */
const MAX_DAYS_AS_WEEKS = 8 * DAYS_PER_WEEK;

/**
 * How long ago a volunteer last served, phrased for the rostering rail:
 * "last served 5 weeks ago", "last served today", "never served".
 *
 * Deliberately not a generic relative formatter: those jump straight from
 * days to months, so a six-week gap reads "42 days ago". A serving
 * rotation is counted in weeks, and that gap is what this line exists to show.
 *
 * Dates in the future (clock skew) read as "today" rather than going negative.
 */
export function formatLastServed({
  lastServedAt,
  timeZone,
}: FormatLastServedInput): string {
  if (!lastServedAt || !isInstant({ value: lastServedAt })) {
    return 'never served';
  }

  const servedDay = today({
    instant: parseInstant({ value: lastServedAt }),
    timeZone,
  });
  const days = Math.max(
    calendarDaysBetween({
      start: servedDay,
      end: today({ instant: now(), timeZone }),
    }),
    0,
  );
  if (days === 0) return 'last served today';
  if (days === 1) return 'last served yesterday';
  if (days < DAYS_PER_WEEK) return `last served ${days} days ago`;
  if (days <= MAX_DAYS_AS_WEEKS) {
    const weeks = Math.floor(days / DAYS_PER_WEEK);
    return `last served ${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  const months = Math.floor(days / DAYS_PER_MONTH);
  return `last served ${months} ${months === 1 ? 'month' : 'months'} ago`;
}
