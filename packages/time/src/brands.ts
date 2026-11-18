import { utcMidnightOf } from './utc-calendar';

declare const timeBrand: unique symbol;

export type TimeKind = 'Instant' | 'CalendarDay' | 'TimeOfDay';

type TimeBrand<Kind extends TimeKind> = string & {
  readonly [timeBrand]: Kind;
};

/** A single absolute moment, as a canonical ISO-8601 UTC string
 * (`2027-01-04T13:30:00.000Z`). Canonical form makes string order time order. */
export type Instant = TimeBrand<'Instant'>;

/** A labelled day, `yyyy-MM-dd`, with no time and no offset. */
export type CalendarDay = TimeBrand<'CalendarDay'>;

/** A wall-clock hour and minute, `HH:mm`, with no day and no offset. */
export type TimeOfDay = TimeBrand<'TimeOfDay'>;

/** What an `InvalidTimeValueError` rejected: a kind of time, or the Church
 * Timezone name used to relate them. */
export type InvalidTimeValueKind = TimeKind | 'TimeZone';

interface InvalidTimeValueErrorInput {
  kind: InvalidTimeValueKind;
  value: string;
}

export class InvalidTimeValueError extends Error {
  readonly kind: InvalidTimeValueKind;
  readonly value: string;

  constructor({ kind, value }: InvalidTimeValueErrorInput) {
    super(`Invalid ${kind}: "${value}"`);
    this.name = 'InvalidTimeValueError';
    this.kind = kind;
    this.value = value;
  }
}

export interface TimeValueInput {
  value: string;
}

const CALENDAR_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
// UTC only (`Z`), whole seconds, optional milliseconds. Offsets are refused, not
// normalised: a non-UTC string reaching the seam is a bug upstream.
const INSTANT_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{3})?Z$/;

export function isCalendarDay({ value }: TimeValueInput): boolean {
  if (!CALENDAR_DAY_PATTERN.test(value)) return false;
  const date = utcMidnightOf({ day: value });
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Strictly `HH:mm`. Database `time` columns read through `fromTimeColumn`. */
export function isTimeOfDay({ value }: TimeValueInput): boolean {
  return TIME_OF_DAY_PATTERN.test(value);
}

/** `yyyy-MM-ddTHH:mm:ssZ` or `yyyy-MM-ddTHH:mm:ss.sssZ` on a real day. */
export function isInstant({ value }: TimeValueInput): boolean {
  const day = INSTANT_PATTERN.exec(value)?.[1];
  return day !== undefined && isCalendarDay({ value: day });
}

export function parseCalendarDay({ value }: TimeValueInput): CalendarDay {
  if (!isCalendarDay({ value })) {
    throw new InvalidTimeValueError({ kind: 'CalendarDay', value });
  }
  return value as CalendarDay;
}

export function parseTimeOfDay({ value }: TimeValueInput): TimeOfDay {
  if (!isTimeOfDay({ value })) {
    throw new InvalidTimeValueError({ kind: 'TimeOfDay', value });
  }
  return value as TimeOfDay;
}

/** Accepts what `isInstant` accepts; always returns the millisecond form. */
export function parseInstant({ value }: TimeValueInput): Instant {
  if (!isInstant({ value })) {
    throw new InvalidTimeValueError({ kind: 'Instant', value });
  }
  return new Date(value).toISOString() as Instant;
}
