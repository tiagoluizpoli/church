declare const timeBrand: unique symbol;

type TimeBrand<Kind extends string> = string & {
  readonly [timeBrand]: Kind;
};

/** A single absolute moment, as a canonical ISO-8601 UTC string
 * (`2027-01-04T13:30:00.000Z`). Canonical form makes string order time order. */
export type Instant = TimeBrand<'Instant'>;

/** A labelled day, `yyyy-MM-dd`, with no time and no offset. */
export type CalendarDay = TimeBrand<'CalendarDay'>;

/** A wall-clock hour and minute, `HH:mm`, with no day and no offset. */
export type TimeOfDay = TimeBrand<'TimeOfDay'>;

export type TimeKind = 'Instant' | 'CalendarDay' | 'TimeOfDay';

interface InvalidTimeValueErrorInput {
  kind: TimeKind;
  value: string;
}

export class InvalidTimeValueError extends Error {
  readonly kind: TimeKind;
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
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:00)?$/;
// An explicit offset is required: a wall clock without one names no moment.
const INSTANT_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

export function isCalendarDay({ value }: TimeValueInput): boolean {
  if (!CALENDAR_DAY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function isTimeOfDay({ value }: TimeValueInput): boolean {
  return TIME_OF_DAY_PATTERN.test(value);
}

export function isInstant({ value }: TimeValueInput): boolean {
  const match = INSTANT_PATTERN.exec(value);
  if (!match?.[1] || !isCalendarDay({ value: match[1] })) return false;
  return !Number.isNaN(Date.parse(value));
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
  return value.slice(0, 5) as TimeOfDay;
}

export function parseInstant({ value }: TimeValueInput): Instant {
  if (!isInstant({ value })) {
    throw new InvalidTimeValueError({ kind: 'Instant', value });
  }
  return new Date(value).toISOString() as Instant;
}
