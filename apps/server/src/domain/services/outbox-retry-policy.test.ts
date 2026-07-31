import { describe, expect, it } from 'vitest';
import {
  hasExhaustedRetries,
  nextRetryAt,
  OUTBOX_MAX_ATTEMPTS,
} from './outbox-retry-policy';

describe('outbox retry policy', () => {
  it('has not exhausted retries below the attempt cap', () => {
    expect(hasExhaustedRetries(0)).toBe(false);
    expect(hasExhaustedRetries(OUTBOX_MAX_ATTEMPTS - 1)).toBe(false);
  });

  it('has exhausted retries at or above the attempt cap', () => {
    expect(hasExhaustedRetries(OUTBOX_MAX_ATTEMPTS)).toBe(true);
    expect(hasExhaustedRetries(OUTBOX_MAX_ATTEMPTS + 1)).toBe(true);
  });

  it('backs off exponentially in minutes', () => {
    const now = Date.now();
    expect(nextRetryAt(1).getTime() - now).toBeCloseTo(2 * 60_000, -2);
    expect(nextRetryAt(2).getTime() - now).toBeCloseTo(4 * 60_000, -2);
    expect(nextRetryAt(3).getTime() - now).toBeCloseTo(8 * 60_000, -2);
  });

  it('caps backoff at one hour', () => {
    const now = Date.now();
    expect(nextRetryAt(10).getTime() - now).toBeCloseTo(60 * 60_000, -2);
  });
});
