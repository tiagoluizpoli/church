import { formatInTimeZone } from 'date-fns-tz';
import type { CalendarDay, Instant, TimeOfDay } from './brands';
import { fromDate, toDate } from './persistence';
import { assertTimeZone } from './time-zone';
import { DAY_MS, MINUTE_MS, utcMidnightOf } from './utc-calendar';

interface ZoneOffsetInput {
  timeZone: string;
  epochMs: number;
}

const OFFSET_PATTERN = /^([+-])(\d{2}):(\d{2})$/;

/** The zone's UTC offset at a moment, in ms, east positive. Read back from the
 * formatted offset: date-fns-tz's `getTimezoneOffset` is an hour off in the hour
 * beside a DST transition. */
function zoneOffsetMs({ timeZone, epochMs }: ZoneOffsetInput): number {
  const match = OFFSET_PATTERN.exec(
    formatInTimeZone(new Date(epochMs), timeZone, 'xxx'),
  );
  if (!match) return Number.NaN;
  const [, sign, hours, minutes] = match;
  const magnitude = (Number(hours) * 60 + Number(minutes)) * MINUTE_MS;
  return sign === '-' ? -magnitude : magnitude;
}

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

export interface InstantInTimeZoneInput {
  instant: Instant;
  timeZone: string;
}

/** The CalendarDay an Instant falls on in the Church Timezone. */
export function today({
  instant,
  timeZone,
}: InstantInTimeZoneInput): CalendarDay {
  assertTimeZone({ timeZone });
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
}: InstantInTimeZoneInput): TimeOfDay {
  assertTimeZone({ timeZone });
  return formatInTimeZone(toDate({ instant }), timeZone, 'HH:mm') as TimeOfDay;
}
