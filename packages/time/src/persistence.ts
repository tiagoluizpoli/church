import {
  type Instant,
  InvalidTimeValueError,
  isTimeOfDay,
  type TimeOfDay,
  type TimeValueInput,
} from './brands';

export interface ToDateInput {
  instant: Instant;
}

export interface FromDateInput {
  date: Date;
}

/** Instant → `Date`, for driver boundaries (Drizzle timestamp columns stay in
 * `Date` mode; `mode: 'string'` staples the process offset onto UTC). */
export function toDate({ instant }: ToDateInput): Date {
  return new Date(instant);
}

/** `Date` → Instant, for rows read back from the driver. Also the package's own
 * `Date` → Instant step, so every Instant built from a `Date` is validated. */
export function fromDate({ date }: FromDateInput): Instant {
  if (Number.isNaN(date.getTime())) {
    throw new InvalidTimeValueError({ kind: 'Instant', value: String(date) });
  }
  return date.toISOString() as Instant;
}

const TIME_COLUMN_PATTERN = /^(\d{2}:\d{2}):00$/;

/** Postgres `time` column → TimeOfDay. The driver returns `HH:mm:ss`; a
 * TimeOfDay has no seconds, so only `:00` is accepted and dropped. Kept apart
 * from `parseTimeOfDay` so the brand constructor stays strictly `HH:mm`. */
export function fromTimeColumn({ value }: TimeValueInput): TimeOfDay {
  const hourAndMinute = TIME_COLUMN_PATTERN.exec(value)?.[1];
  if (hourAndMinute === undefined || !isTimeOfDay({ value: hourAndMinute })) {
    throw new InvalidTimeValueError({ kind: 'TimeOfDay', value });
  }
  return hourAndMinute as TimeOfDay;
}
