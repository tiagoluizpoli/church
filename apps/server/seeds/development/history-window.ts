import {
  addCalendarDays,
  type CalendarDay,
  parseCalendarDay,
} from '@church/time';

export interface HistoricalCycleWindowInput {
  anchor: CalendarDay;
}

/** A Cycle's bounds: `endDate` is its last day, as the cycle's own. */
export interface HistoricalCycleWindow {
  startDate: CalendarDay;
  endDate: CalendarDay;
}

/**
 * The previous complete calendar month before the anchor's: the only range
 * the development scenario materializes. It ends the day before the anchor's
 * month begins, so the current and future months stay empty for manual
 * planning.
 */
export function historicalCycleWindow({
  anchor,
}: HistoricalCycleWindowInput): HistoricalCycleWindow {
  const anchorMonthStart = parseCalendarDay({
    value: `${anchor.slice(0, 7)}-01`,
  });
  const endDate = addCalendarDays({ day: anchorMonthStart, days: -1 });
  return {
    startDate: parseCalendarDay({ value: `${endDate.slice(0, 7)}-01` }),
    endDate,
  };
}
