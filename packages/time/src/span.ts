import { minutesBetween } from './arithmetic';
import type { Instant, TimeOfDay } from './brands';
import { today } from './conversion';
import { DAY_MS, MINUTE_MS } from './utc-calendar';

export interface Span {
  durationMinutes: number;
  crossesToNextDay: boolean;
}

export interface TimeOfDaySpanInput {
  start: TimeOfDay;
  end: TimeOfDay;
}

const MINUTES_PER_DAY = DAY_MS / MINUTE_MS;

interface TimeOfDayMinutesInput {
  time: TimeOfDay;
}

function timeOfDayMinutes({ time }: TimeOfDayMinutesInput): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Duration and midnight-crossing for a wall-clock TimeBlock pair: an end
 * earlier than its start crosses onto the next CalendarDay, per `CONTEXT.md`. */
export function timeOfDaySpan({ start, end }: TimeOfDaySpanInput): Span {
  const startMinutes = timeOfDayMinutes({ time: start });
  const endMinutes = timeOfDayMinutes({ time: end });
  const crossesToNextDay = endMinutes < startMinutes;
  const durationMinutes = crossesToNextDay
    ? MINUTES_PER_DAY - startMinutes + endMinutes
    : endMinutes - startMinutes;
  return { durationMinutes, crossesToNextDay };
}

export interface InstantSpanInput {
  start: Instant;
  end: Instant;
  timeZone: string;
}

/** Duration and midnight-crossing for an Instant pair, judged by the
 * CalendarDay each endpoint falls on in the Church Timezone. */
export function instantSpan({ start, end, timeZone }: InstantSpanInput): Span {
  const durationMinutes = minutesBetween({ start, end });
  const crossesToNextDay =
    today({ instant: start, timeZone }) !== today({ instant: end, timeZone });
  return { durationMinutes, crossesToNextDay };
}
