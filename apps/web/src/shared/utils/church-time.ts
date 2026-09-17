import {
  type CalendarDay,
  formatCalendarDay,
  formatInstant,
  formatTimeOfDay,
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
export function formatTimeOf({ value, timeZone }: ChurchInstantInput): string {
  return formatTimeOfDay({
    time: toTimeOfDay({ instant: parseInstant({ value }), timeZone }),
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

/** `09:00 – 18:00`, with no date — for a slot/shift time range shown
 * alongside a day header that already carries the date. */
export function formatTimeRangeOf({
  start,
  end,
  timeZone,
}: ChurchTimeRangeInput): string {
  return `${formatTimeOf({ value: start, timeZone })} – ${formatTimeOf({ value: end, timeZone })}`;
}
