import { addCalendarDays } from './arithmetic';
import {
  type CalendarDay,
  type Instant,
  parseTimeOfDay,
  type TimeOfDay,
} from './brands';
import { fromDate, toDate } from './persistence';
import { assertTimeZone } from './time-zone';
import { DAY_MS, MINUTE_MS, utcMidnightOf } from './utc-calendar';
import {
  type WallClockFields,
  wallClockFields,
  zoneOffsetMs,
} from './wall-clock';

export interface ToInstantInput {
  day: CalendarDay;
  time: TimeOfDay;
  timeZone: string;
}

/**
 * TimeOfDay + CalendarDay + Church Timezone → Instant. The only direction.
 *
 * Around a DST transition (Temporal's `'compatible'` policy):
 * - a wall clock skipped by spring-forward moves later by the gap — 02:30 on
 *   2027-03-14 in America/New_York becomes 03:30 EDT (`07:30Z`);
 * - a wall clock repeated by fall-back takes the earlier Instant — 01:30 on
 *   2027-11-07 in America/New_York is 01:30 EDT (`05:30Z`), not EST.
 *
 * Resolved here rather than by date-fns-tz's `fromZonedTime`, whose choice for a
 * repeated wall clock depends on the process TZ.
 */
export function toInstant({ day, time, timeZone }: ToInstantInput): Instant {
  assertTimeZone({ timeZone });
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  // The wall clock read as if it were UTC; subtracting an offset gives a moment.
  const wallClockMs =
    utcMidnightOf({ day }).getTime() + (hours * 60 + minutes) * MINUTE_MS;
  // Zones change offset at most once a day, so these bracket any transition.
  const offsetBefore = zoneOffsetMs({
    timeZone,
    epochMs: wallClockMs - DAY_MS,
  });
  const offsetAfter = zoneOffsetMs({ timeZone, epochMs: wallClockMs + DAY_MS });
  // A candidate is real when the zone's offset at that moment is the one used.
  const matches = [offsetBefore, offsetAfter]
    .map((offset) => wallClockMs - offset)
    .filter(
      (candidateMs) =>
        wallClockMs - zoneOffsetMs({ timeZone, epochMs: candidateMs }) ===
        candidateMs,
    );
  // No match means a spring-forward gap: the pre-transition offset lands past it.
  const resolvedMs =
    matches.length > 0 ? Math.min(...matches) : wallClockMs - offsetBefore;
  return fromDate({ date: new Date(resolvedMs) });
}

export interface CalendarDayInTimeZoneInput {
  day: CalendarDay;
  timeZone: string;
}

/** Half-open `[start, end)`: `end` is the next church-local midnight. */
export interface InstantBounds {
  start: Instant;
  end: Instant;
}

const MIDNIGHT = parseTimeOfDay({ value: '00:00' });

/**
 * The Instants a CalendarDay covers in the Church Timezone: church-local
 * midnight up to (not including) the next one. A DST day spans 23 or 25 hours;
 * a skipped midnight starts at the first real Instant, per `toInstant`.
 */
export function calendarDayBounds({
  day,
  timeZone,
}: CalendarDayInTimeZoneInput): InstantBounds {
  return {
    start: toInstant({ day, time: MIDNIGHT, timeZone }),
    end: toInstant({
      day: addCalendarDays({ day, days: 1 }),
      time: MIDNIGHT,
      timeZone,
    }),
  };
}

export interface InstantInTimeZoneInput {
  instant: Instant;
  timeZone: string;
}

/** Every read of an Instant's Church Timezone wall clock funnels through
 * here, so `assertTimeZone` and the `Date` bridge are paid once. */
function wallClock({
  instant,
  timeZone,
}: InstantInTimeZoneInput): WallClockFields {
  assertTimeZone({ timeZone });
  return wallClockFields({
    timeZone,
    epochMs: toDate({ instant }).getTime(),
  });
}

/** The CalendarDay an Instant falls on in the Church Timezone. */
export function today({
  instant,
  timeZone,
}: InstantInTimeZoneInput): CalendarDay {
  const { year, month, day } = wallClock({ instant, timeZone });
  return `${year}-${month}-${day}` as CalendarDay;
}

/** The TimeOfDay an Instant reads as on the Church Timezone's wall clock. */
export function toTimeOfDay({
  instant,
  timeZone,
}: InstantInTimeZoneInput): TimeOfDay {
  const { hour, minute } = wallClock({ instant, timeZone });
  return `${hour}:${minute}` as TimeOfDay;
}

/** `HH:mm:ss` on the Church Timezone's wall clock. Not a TimeOfDay: that
 * brand is strictly `HH:mm`. For the seam's second-precision presentation. */
export function toTimeOfDaySeconds({
  instant,
  timeZone,
}: InstantInTimeZoneInput): string {
  const { hour, minute, second } = wallClock({ instant, timeZone });
  return `${hour}:${minute}:${second}`;
}
