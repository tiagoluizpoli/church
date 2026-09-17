import {
  type CalendarDay,
  formatCalendarDay,
  formatInstant,
  formatTimeOfDay,
  parseCalendarDay,
  parseInstant,
  today,
  toTimeOfDay,
} from '@church/time';

/**
 * Reads an API instant (an ISO string) through the Church Timezone. Every
 * displayed day and time on the web resolves here — there is no viewer's
 * clock (ADR-0003). The zone is always a parameter; `useTimezone()` supplies
 * it in components.
 */
export interface ChurchInstantInput {
  value: string;
  timeZone: string;
}

export function dayOf({ value, timeZone }: ChurchInstantInput): CalendarDay {
  return today({ instant: parseInstant({ value }), timeZone });
}

/** `04/01/2027` */
export function formatDayOf(input: ChurchInstantInput): string {
  return formatCalendarDay({ day: dayOf(input) });
}

/** `14:30` */
function formatTimeOf({ value, timeZone }: ChurchInstantInput): string {
  return formatTimeOfDay({
    time: toTimeOfDay({ instant: parseInstant({ value }), timeZone }),
  });
}

export interface CalendarDateOnlyInput {
  value: string;
}

/**
 * `04/01/2027` for a value that *names a day* rather than a moment — a
 * planning-cycle bound, anchored at UTC midnight, never converted through
 * the Church Timezone. Accepts either a bare `yyyy-MM-dd` or a full
 * ISO date-time whose calendar-date prefix is the day it names.
 */
export function formatCalendarDateOnly({
  value,
}: CalendarDateOnlyInput): string {
  return formatCalendarDay({
    day: parseCalendarDay({ value: value.slice(0, 10) }),
  });
}

/** `04/01/2027 14:30` */
export function formatInstantOf({
  value,
  timeZone,
}: ChurchInstantInput): string {
  return formatInstant({ instant: parseInstant({ value }), timeZone });
}

export interface ChurchTimeRangeInput {
  start: string;
  end: string;
  timeZone: string;
}

/**
 * `04/01/2027 09:00 – 18:00`, or `04/01/2027 22:00 – 05/01/2027 02:00` when the
 * window ends on a later church day.
 */
export function formatInstantRangeOf({
  start,
  end,
  timeZone,
}: ChurchTimeRangeInput): string {
  const endLabel =
    dayOf({ value: start, timeZone }) === dayOf({ value: end, timeZone })
      ? formatTimeOf({ value: end, timeZone })
      : formatInstantOf({ value: end, timeZone });
  return `${formatInstantOf({ value: start, timeZone })} – ${endLabel}`;
}
