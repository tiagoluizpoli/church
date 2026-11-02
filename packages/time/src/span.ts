import { addCalendarDays, minutesBetween } from './arithmetic';
import type { CalendarDay, Instant, TimeOfDay } from './brands';
import { today, toInstant } from './conversion';
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

/** Duration and midnight-crossing for a wall-clock TemplateTimeBlock pair: an end
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

export interface TimeOfDayOffsetInput {
  from: TimeOfDay;
  to: TimeOfDay;
}

/** Minutes forward from `from` to the next `to` on the repeating 24h clock
 * (0 to 1439); an earlier `to` wraps past midnight. */
export function timeOfDayOffset({ from, to }: TimeOfDayOffsetInput): number {
  const delta =
    timeOfDayMinutes({ time: to }) - timeOfDayMinutes({ time: from });
  return (delta + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export interface ToInstantAfterInput {
  /** The CalendarDay on which `anchor` falls. */
  day: CalendarDay;
  anchor: TimeOfDay;
  time: TimeOfDay;
  timeZone: string;
}

/** The first occurrence of `time` at or after `anchor` on `day`: that day when
 * the clock has not wrapped, else the next CalendarDay (overnight blocks). */
export function toInstantAfter({
  day,
  anchor,
  time,
  timeZone,
}: ToInstantAfterInput): Instant {
  const wraps =
    timeOfDayMinutes({ time: anchor }) +
      timeOfDayOffset({ from: anchor, to: time }) >=
    MINUTES_PER_DAY;
  return toInstant({
    day: wraps ? addCalendarDays({ day, days: 1 }) : day,
    time,
    timeZone,
  });
}
