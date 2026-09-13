import { type Instant, InvalidTimeValueError } from './brands';

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

/** `Date` → Instant, for rows read back from the driver. */
export function fromDate({ date }: FromDateInput): Instant {
  if (Number.isNaN(date.getTime())) {
    throw new InvalidTimeValueError({ kind: 'Instant', value: String(date) });
  }
  return date.toISOString() as Instant;
}
