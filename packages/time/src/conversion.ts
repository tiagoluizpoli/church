import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { CalendarDay, Instant, TimeOfDay } from './brands';
import { fromDate, toDate } from './persistence';

export interface ToInstantInput {
  day: CalendarDay;
  time: TimeOfDay;
  timeZone: string;
}

/** TimeOfDay + CalendarDay + Church Timezone → Instant. The only direction. */
export function toInstant({ day, time, timeZone }: ToInstantInput): Instant {
  return fromDate({ date: fromZonedTime(`${day}T${time}:00`, timeZone) });
}

export interface ReadInstantInput {
  instant: Instant;
  timeZone: string;
}

/** The CalendarDay an Instant falls on in the Church Timezone. */
export function today({ instant, timeZone }: ReadInstantInput): CalendarDay {
  return formatInTimeZone(
    toDate({ instant }),
    timeZone,
    'yyyy-MM-dd',
  ) as CalendarDay;
}

/** The TimeOfDay an Instant reads as on the Church Timezone's wall clock. */
export function toTimeOfDay({
  instant,
  timeZone,
}: ReadInstantInput): TimeOfDay {
  return formatInTimeZone(toDate({ instant }), timeZone, 'HH:mm') as TimeOfDay;
}
