import { appConfig } from '@church/app-config';
import { addCalendarDays, type CalendarDay } from '@church/time';

/** The planning window a scheduling journey creates its own PlanningCycle
 * over. It opens CYCLE_START_OFFSET_DAYS after the anchor and spans four
 * weeks, so it always holds at least four Sundays and ends in the future. The
 * offset keeps the first Sunday beyond the volunteer cancel lead time on any
 * weekday: the server refuses a cancel within `assignment.cancelLeadTimeDays`
 * of the shift, which a Thursday-to-Saturday anchor would otherwise breach. */
export interface PlanningCycleWindow {
  startDate: CalendarDay;
  endDate: CalendarDay;
}

/** Lead time plus a margin, so the first Sunday is never a borderline cancel. */
const CYCLE_START_OFFSET_DAYS = appConfig.assignment.cancelLeadTimeDays + 2;
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
