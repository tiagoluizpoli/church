import { type Instant, millisecondsBetween } from '@church/time';
import type {
  ResendThrottleCheckInput,
  ResendThrottleState,
} from './resend-throttle.types';

export function isResendCooldownActive({
  state,
  policy,
  now,
}: ResendThrottleCheckInput): boolean {
  if (!state.lastResendAt) return false;
  const { cooldownMs } = policy;
  const sinceLastResendMs = millisecondsBetween({
    start: state.lastResendAt,
    end: now,
  });
  return sinceLastResendMs < cooldownMs;
}

function isResendWindowExpired({
  state,
  policy,
  now,
}: ResendThrottleCheckInput): boolean {
  if (!state.resendWindowStartedAt) return true;
  const { windowMs } = policy;
  const sinceWindowStartMs = millisecondsBetween({
    start: state.resendWindowStartedAt,
    end: now,
  });
  return sinceWindowStartMs >= windowMs;
}

export function hasResendDailyCapExceeded({
  state,
  policy,
  now,
}: ResendThrottleCheckInput): boolean {
  if (isResendWindowExpired({ state, policy, now })) return false;
  const { dailyCap } = policy;
  return state.resendCount >= dailyCap;
}

/** The throttle fields to persist once a resend is allowed through. */
export function nextResendThrottleState({
  state,
  policy,
  now,
}: ResendThrottleCheckInput): Required<ResendThrottleState> {
  const windowExpired = isResendWindowExpired({ state, policy, now });
  return {
    lastResendAt: now,
    resendCount: windowExpired ? 1 : state.resendCount + 1,
    resendWindowStartedAt: windowExpired
      ? now
      : (state.resendWindowStartedAt as Instant),
  };
}
