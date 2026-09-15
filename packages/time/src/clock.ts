import type { Instant, TimeOfDay } from './brands';
import { toTimeOfDay } from './conversion';
import { fromDate } from './persistence';

let testClock: Instant | undefined;

/** The current Instant. Fixed by `setTestClock` in tests. */
export function now(): Instant {
  return testClock ?? fromDate({ date: new Date() });
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
