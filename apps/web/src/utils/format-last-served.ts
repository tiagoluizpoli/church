import { differenceInCalendarDays, parseISO } from 'date-fns';

export interface FormatLastServedInput {
  /** ISO instant of the volunteer's most recent serving assignment. */
  lastServedAt?: string;
}

const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
/** Past two months, weeks stop being the unit a leader thinks in. */
const MAX_DAYS_AS_WEEKS = 8 * DAYS_PER_WEEK;

/**
 * How long ago a volunteer last served, phrased for the rostering rail:
 * "last served 5 weeks ago", "last served today", "never served".
 *
 * Deliberately not date-fns' `formatDistanceToNowStrict`: it jumps straight
 * from days to months, so a six-week gap reads "42 days ago". A serving
 * rotation is counted in weeks, and that gap is what this line exists to show.
 *
 * Dates in the future (clock skew) read as "today" rather than going negative.
 */
export function formatLastServed({
  lastServedAt,
}: FormatLastServedInput): string {
  if (!lastServedAt) return 'never served';
  const served = parseISO(lastServedAt);
  if (Number.isNaN(served.getTime())) return 'never served';

  const days = Math.max(differenceInCalendarDays(new Date(), served), 0);
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
