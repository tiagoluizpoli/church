import { describe, expect, it } from 'vitest';
import {
  hasResendDailyCapExceeded,
  isResendCooldownActive,
  nextResendThrottleState,
  RESEND_COOLDOWN_MS,
  RESEND_DAILY_CAP,
  type ResendThrottleState,
} from './resend-throttle';

const now = new Date('2030-01-02T00:00:00Z');

describe('resend throttle — cooldown', () => {
  it('is inactive when there has been no prior resend', () => {
    const state: ResendThrottleState = { resendCount: 0 };
    expect(isResendCooldownActive({ state, now })).toBe(false);
  });

  it('is active just under the cooldown window', () => {
    const state: ResendThrottleState = {
      lastResendAt: new Date(now.getTime() - (RESEND_COOLDOWN_MS - 1)),
      resendCount: 1,
    };
    expect(isResendCooldownActive({ state, now })).toBe(true);
  });

  it('is inactive once the cooldown window has elapsed', () => {
    const state: ResendThrottleState = {
      lastResendAt: new Date(now.getTime() - RESEND_COOLDOWN_MS),
      resendCount: 1,
    };
    expect(isResendCooldownActive({ state, now })).toBe(false);
  });
});

describe('resend throttle — daily cap', () => {
  it('is not exceeded below the cap within the window', () => {
    const state: ResendThrottleState = {
      resendWindowStartedAt: now,
      resendCount: RESEND_DAILY_CAP - 1,
    };
    expect(hasResendDailyCapExceeded({ state, now })).toBe(false);
  });

  it('is exceeded at the cap within the window', () => {
    const state: ResendThrottleState = {
      resendWindowStartedAt: now,
      resendCount: RESEND_DAILY_CAP,
    };
    expect(hasResendDailyCapExceeded({ state, now })).toBe(true);
  });

  it('is not exceeded once the window has rolled over, even at the cap', () => {
    const state: ResendThrottleState = {
      resendWindowStartedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      resendCount: RESEND_DAILY_CAP,
    };
    expect(hasResendDailyCapExceeded({ state, now })).toBe(false);
  });
});

describe('resend throttle — next state', () => {
  it('starts a fresh window on the first resend', () => {
    const state: ResendThrottleState = { resendCount: 0 };
    expect(nextResendThrottleState({ state, now })).toEqual({
      lastResendAt: now,
      resendCount: 1,
      resendWindowStartedAt: now,
    });
  });

  it('increments the count within the same window', () => {
    const windowStartedAt = new Date(now.getTime() - 60_000);
    const state: ResendThrottleState = {
      resendWindowStartedAt: windowStartedAt,
      resendCount: 3,
    };
    expect(nextResendThrottleState({ state, now })).toEqual({
      lastResendAt: now,
      resendCount: 4,
      resendWindowStartedAt: windowStartedAt,
    });
  });

  it('resets the count and starts a new window once the old one expired', () => {
    const state: ResendThrottleState = {
      resendWindowStartedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      resendCount: RESEND_DAILY_CAP,
    };
    expect(nextResendThrottleState({ state, now })).toEqual({
      lastResendAt: now,
      resendCount: 1,
      resendWindowStartedAt: now,
    });
  });
});
