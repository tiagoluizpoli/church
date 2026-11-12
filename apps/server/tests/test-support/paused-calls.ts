import { sql } from 'drizzle-orm';
import { expect, vi } from 'vitest';
import { schedulingTestDb } from '@/tests/scheduling-reshape/setup';

const LOCK_WAIT_TIMEOUT_MS = 5_000;
const LOCK_WAIT_POLL_MS = 20;

const pausedCalls: Array<() => void> = [];

/** Releases and restores every paused call; run it in `afterEach` so a failed barrier strands no transaction. */
export function releasePausedCalls(): void {
  for (const releaseCall of pausedCalls.splice(0)) releaseCall();
}

/** Another transaction of this worker's database is waiting on a row lock. */
export async function waitForLockWaiter(): Promise<void> {
  await vi.waitFor(
    async () => {
      const { rows } = await schedulingTestDb.execute(sql`
        SELECT count(*)::int AS waiting
        FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
      `);
      expect(rows[0]?.waiting).toBeGreaterThan(0);
    },
    { timeout: LOCK_WAIT_TIMEOUT_MS, interval: LOCK_WAIT_POLL_MS },
  );
}

/** Pauses the first call of a repository write inside its transaction until the test releases it. */
export function pauseCall<Repository extends object>(
  prototype: Repository,
  method: keyof Repository,
) {
  const original = prototype[method] as (input: never) => Promise<unknown>;
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached = () => {};
  const paused = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let isFirstCall = true;
  const pausedWrite = async function (this: Repository, input: never) {
    if (isFirstCall) {
      isFirstCall = false;
      reached();
      await released;
    }
    return original.call(this, input);
  };
  const spy = vi
    .spyOn(prototype, method as never)
    .mockImplementation(pausedWrite as never);
  pausedCalls.push(() => {
    release();
    spy.mockRestore();
  });
  return { paused, release };
}
