import type { CalendarDay, Instant } from './brands';

/** `-1` when `left` comes first, `1` when `right` does, `0` when equal — the
 * shape `Array.prototype.sort` expects. */
export type Comparison = -1 | 0 | 1;

export interface InstantComparisonInput {
  left: Instant;
  right: Instant;
}

/** Orders two Instants on the timeline. */
export function compareInstants({
  left,
  right,
}: InstantComparisonInput): Comparison {
  return Math.sign(Date.parse(left) - Date.parse(right)) as Comparison;
}

export interface CalendarDayComparisonInput {
  left: CalendarDay;
  right: CalendarDay;
}

/** Orders two CalendarDays; `yyyy-MM-dd` sorts as text in calendar order. */
export function compareCalendarDays({
  left,
  right,
}: CalendarDayComparisonInput): Comparison {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
