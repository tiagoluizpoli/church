import { addMilliseconds, type Instant, toDate } from '@church/time';

export interface ExpiresAtInput {
  from: Instant;
  milliseconds: number;
}

/** An Instant plus a millisecond TTL, converted to a `Date` for a Drizzle column. */
export function expiresAtAfter({ from, milliseconds }: ExpiresAtInput): Date {
  return toDate({ instant: addMilliseconds({ instant: from, milliseconds }) });
}
