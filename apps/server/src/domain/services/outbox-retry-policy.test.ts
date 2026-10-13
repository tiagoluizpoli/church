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

describe('outbox retry policy', () => {
  beforeEach(() => {
    setTestClock({ instant: FIXED_NOW });
  });

  afterEach(() => {
    resetClock();
  });

  it('has not exhausted retries below the attempt cap', () => {
    expect(hasExhaustedRetries(0)).toBe(false);
    expect(hasExhaustedRetries(appConfig.outbox.maxAttempts - 1)).toBe(false);
  });

  it('has exhausted retries at or above the attempt cap', () => {
    expect(hasExhaustedRetries(appConfig.outbox.maxAttempts)).toBe(true);
    expect(hasExhaustedRetries(appConfig.outbox.maxAttempts + 1)).toBe(true);
  });

  it('backs off exponentially in minutes', () => {
    expect(
      millisecondsBetween({
        start: FIXED_NOW,
        end: nextRetryAt({ attempts: 1 }),
      }),
    ).toBe(2 * 60_000);
    expect(
      millisecondsBetween({
        start: FIXED_NOW,
        end: nextRetryAt({ attempts: 2 }),
      }),
    ).toBe(4 * 60_000);
    expect(
      millisecondsBetween({
        start: FIXED_NOW,
        end: nextRetryAt({ attempts: 3 }),
      }),
    ).toBe(8 * 60_000);
  });

  it('caps backoff at one hour', () => {
    expect(
      millisecondsBetween({
        start: FIXED_NOW,
        end: nextRetryAt({ attempts: 10 }),
      }),
    ).toBe(60 * 60_000);
  });
});
