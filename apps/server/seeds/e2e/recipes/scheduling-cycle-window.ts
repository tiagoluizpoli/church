import { addCalendarDays, type CalendarDay } from '@church/time';

/** The planning window a scheduling journey creates its own PlanningCycle
 * over. It opens the day after the anchor and spans four weeks, so it always
 * holds at least four Sundays and ends in the future. */
export interface PlanningCycleWindow {
  startDate: CalendarDay;
  endDate: CalendarDay;
}

const CYCLE_START_OFFSET_DAYS = 1;
const CYCLE_LENGTH_DAYS = 28;

export interface PlanningCycleWindowInput {
  anchor: CalendarDay;
}

export function planningCycleWindow({
  anchor,
}: PlanningCycleWindowInput): PlanningCycleWindow {
  return {
    startDate: addCalendarDays({ day: anchor, days: CYCLE_START_OFFSET_DAYS }),
    endDate: addCalendarDays({
      day: anchor,
      days: CYCLE_START_OFFSET_DAYS + CYCLE_LENGTH_DAYS,
    }),
  };
}

/** What every scheduling journey result carries besides its Church graph. */
export interface SchedulingJourneyDates {
  anchor: CalendarDay;
  /** The window the journey creates its PlanningCycle over. */
  cycleWindow: PlanningCycleWindow;
}
