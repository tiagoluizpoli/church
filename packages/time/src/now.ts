import type { Instant } from './brands';
import { fromDate, toDate } from './persistence';

// Kept free of third-party imports: tooling that runs before `bun install`
// (worktree bootstrap) reads the clock through this module.

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
