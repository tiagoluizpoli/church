import { appConfig } from '@church/app-config';
import { addMilliseconds, parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import {
  hasResendDailyCapExceeded,
  isResendCooldownActive,
  nextResendThrottleState,
  type ResendThrottleState,
} from './resend-throttle';

const now = parseInstant({ value: '2030-01-02T00:00:00Z' });
const policy = appConfig.invitationResend;
const MINUTE_MS = 60_000;

describe('resend throttle — cooldown', () => {
  it('is inactive when there has been no prior resend', () => {
    const state: ResendThrottleState = { resendCount: 0 };
    expect(isResendCooldownActive({ state, policy, now })).toBe(false);
  });

  it('is active just under the cooldown window', () => {
    const { cooldownMs } = appConfig.invitationResend;
    const state: ResendThrottleState = {
      lastResendAt: addMilliseconds({
        instant: now,
        milliseconds: -(cooldownMs - 1),
      }),
      resendCount: 1,
    };
    expect(isResendCooldownActive({ state, policy, now })).toBe(true);
  });

  it('is inactive once the cooldown window has elapsed', () => {
    const { cooldownMs } = appConfig.invitationResend;
    const state: ResendThrottleState = {
      lastResendAt: addMilliseconds({
        instant: now,
        milliseconds: -cooldownMs,
      }),
      resendCount: 1,
    };
    expect(isResendCooldownActive({ state, policy, now })).toBe(false);
  });
});

describe('resend throttle — daily cap', () => {
  it('is not exceeded below the cap within the window', () => {
    const { dailyCap } = appConfig.invitationResend;
    const state: ResendThrottleState = {
      resendWindowStartedAt: now,
      resendCount: dailyCap - 1,
    };
    expect(hasResendDailyCapExceeded({ state, policy, now })).toBe(false);
  });

  it('is exceeded at the cap within the window', () => {
    const { dailyCap } = appConfig.invitationResend;
    const state: ResendThrottleState = {
      resendWindowStartedAt: now,
      resendCount: dailyCap,
    };
    expect(hasResendDailyCapExceeded({ state, policy, now })).toBe(true);
  });

  it('is not exceeded once the window has rolled over, even at the cap', () => {
    const { dailyCap, windowMs } = appConfig.invitationResend;
    const state: ResendThrottleState = {
      resendWindowStartedAt: addMilliseconds({
        instant: now,
        milliseconds: -windowMs,
      }),
      resendCount: dailyCap,
    };
    expect(hasResendDailyCapExceeded({ state, policy, now })).toBe(false);
  });
});

describe('resend throttle — next state', () => {
  it('starts a fresh window on the first resend', () => {
    const state: ResendThrottleState = { resendCount: 0 };
    expect(nextResendThrottleState({ state, policy, now })).toEqual({
      lastResendAt: now,
      resendCount: 1,
      resendWindowStartedAt: now,
    });
  });

  it('increments the count within the same window', () => {
    const windowStartedAt = addMilliseconds({
      instant: now,
      milliseconds: -MINUTE_MS,
    });
    const state: ResendThrottleState = {
      resendWindowStartedAt: windowStartedAt,
      resendCount: 3,
    };
    expect(nextResendThrottleState({ state, policy, now })).toEqual({
      lastResendAt: now,
      resendCount: 4,
      resendWindowStartedAt: windowStartedAt,
    });
  });

  it('resets the count and starts a new window once the old one expired', () => {
    const { dailyCap, windowMs } = appConfig.invitationResend;
    const state: ResendThrottleState = {
      resendWindowStartedAt: addMilliseconds({
        instant: now,
        milliseconds: -windowMs,
      }),
      resendCount: dailyCap,
    };
    expect(nextResendThrottleState({ state, policy, now })).toEqual({
      lastResendAt: now,
      resendCount: 1,
      resendWindowStartedAt: now,
    });
  });
});
