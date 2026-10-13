import { appConfig } from '@church/app-config';
import {
  millisecondsBetween,
  parseInstant,
  resetClock,
  setTestClock,
} from '@church/time';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasExhaustedRetries, nextRetryAt } from './outbox-retry-policy';

const FIXED_NOW = parseInstant({ value: '2027-01-04T12:00:00Z' });
const MINUTE_MS = 60_000;
const FIRST_RETRY_BACKOFF_MINUTES = 2;
const SECOND_RETRY_BACKOFF_MINUTES = 4;
const THIRD_RETRY_BACKOFF_MINUTES = 8;
const ATTEMPTS_PAST_THE_BACKOFF_CAP = 10;
const policy = appConfig.outbox;

function backoffMsAfter({ attempts }: { attempts: number }): number {
  const end = nextRetryAt({ attempts, policy });
  return millisecondsBetween({ start: FIXED_NOW, end });
}

describe('outbox retry policy', () => {
  beforeEach(() => {
    setTestClock({ instant: FIXED_NOW });
  });

  afterEach(() => {
    resetClock();
  });

  it('has not exhausted retries below the attempt cap', () => {
    const { maxAttempts } = appConfig.outbox;
    expect(hasExhaustedRetries({ attempts: 0, policy })).toBe(false);
    expect(hasExhaustedRetries({ attempts: maxAttempts - 1, policy })).toBe(
      false,
    );
  });

  it('has exhausted retries at or above the attempt cap', () => {
    const { maxAttempts } = appConfig.outbox;
    expect(hasExhaustedRetries({ attempts: maxAttempts, policy })).toBe(true);
    expect(hasExhaustedRetries({ attempts: maxAttempts + 1, policy })).toBe(
      true,
    );
  });

  it('backs off exponentially in minutes', () => {
    expect(backoffMsAfter({ attempts: 1 })).toBe(
      FIRST_RETRY_BACKOFF_MINUTES * MINUTE_MS,
    );
    expect(backoffMsAfter({ attempts: 2 })).toBe(
      SECOND_RETRY_BACKOFF_MINUTES * MINUTE_MS,
    );
    expect(backoffMsAfter({ attempts: 3 })).toBe(
      THIRD_RETRY_BACKOFF_MINUTES * MINUTE_MS,
    );
  });

  it('caps backoff at the configured number of minutes', () => {
    const { backoffCapMinutes } = appConfig.outbox;
    expect(backoffMsAfter({ attempts: ATTEMPTS_PAST_THE_BACKOFF_CAP })).toBe(
      backoffCapMinutes * MINUTE_MS,
    );
  });
});
