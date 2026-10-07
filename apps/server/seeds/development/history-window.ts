import {
  addCalendarDays,
  type CalendarDay,
  parseCalendarDay,
} from '@church/time';

export interface HistoricalCycleWindowInput {
  anchor: CalendarDay;
}

/** A PlanningCycle's bounds: `endDate` is exclusive, as the cycle's own. */
export interface HistoricalCycleWindow {
  startDate: CalendarDay;
  endDate: CalendarDay;
}

/**
 * The previous complete calendar month before the anchor's: the only range
 * the development scenario materializes. It ends where the anchor's month
 * begins, so the current and future months stay empty for manual planning.
 */
export function historicalCycleWindow({
  anchor,
}: HistoricalCycleWindowInput): HistoricalCycleWindow {
  const endDate = parseCalendarDay({ value: `${anchor.slice(0, 7)}-01` });
  const lastDayOfPreviousMonth = addCalendarDays({ day: endDate, days: -1 });
  return {
    startDate: parseCalendarDay({
      value: `${lastDayOfPreviousMonth.slice(0, 7)}-01`,
    }),
    endDate,
  };
}
