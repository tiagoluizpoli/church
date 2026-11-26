import { addCalendarDays, type CalendarDay } from '@church/time';

/** The planning window a scheduling journey creates its own Cycle
 * over. It opens CYCLE_START_OFFSET_DAYS after the anchor and includes
 * exactly four weeks (endDate is the last included day), so it always holds
 * four Sundays and ends in the future. */
export interface CycleWindow {
  startDate: CalendarDay;
  endDate: CalendarDay;
}

const CYCLE_START_OFFSET_DAYS = 5;
const CYCLE_LENGTH_DAYS = 28;

export interface CycleWindowInput {
  anchor: CalendarDay;
}

export function cycleWindow({ anchor }: CycleWindowInput): CycleWindow {
  return {
    startDate: addCalendarDays({ day: anchor, days: CYCLE_START_OFFSET_DAYS }),
    endDate: addCalendarDays({
      day: anchor,
      days: CYCLE_START_OFFSET_DAYS + CYCLE_LENGTH_DAYS - 1,
    }),
  };
}

/** What every scheduling journey result carries besides its Church graph. */
export interface SchedulingJourneyDates {
  anchor: CalendarDay;
  /** The window the journey creates its Cycle over. */
  cycleWindow: CycleWindow;
}
