import type { Instant, TimeOfDay } from './brands';
import { toTimeOfDay } from './conversion';
import { fromDate, toDate } from './persistence';

let testClock: Instant | undefined;

/** The current Instant. Fixed by `setTestClock` in tests. */
export function now(): Instant {
  return testClock ?? fromDate({ date: new Date() });
}

/** `now()` as a `Date`, for driver/contract boundaries that still take one
 * (e.g. a default parameter typed `Date`). Prefer `now()` everywhere else. */
export function nowAsDate(): Date {
  return toDate({ instant: now() });
}

export interface SetTestClockInput {
  instant: Instant;
}

/** Test-only: pin `now()` until `resetClock()`. */
export function setTestClock({ instant }: SetTestClockInput): void {
  testClock = instant;
}

/** Test-only: return `now()` to the real clock. */
export function resetClock(): void {
  testClock = undefined;
}

export interface CurrentTimeOfDayInput {
  timeZone: string;
}

export function currentTimeOfDay({
  timeZone,
}: CurrentTimeOfDayInput): TimeOfDay {
  return toTimeOfDay({ instant: now(), timeZone });
}
