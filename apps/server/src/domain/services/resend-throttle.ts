import { appConfig } from '@church/app-config';
import { type Instant, millisecondsBetween } from '@church/time';

export interface ResendThrottleState {
  lastResendAt?: Instant;
  resendCount: number;
  resendWindowStartedAt?: Instant;
}

export interface ResendThrottleCheckInput {
  state: ResendThrottleState;
  now: Instant;
}

export function isResendCooldownActive({
  state,
  now,
}: ResendThrottleCheckInput): boolean {
  if (!state.lastResendAt) return false;
  return (
    millisecondsBetween({ start: state.lastResendAt, end: now }) <
    appConfig.invitationResend.cooldownMs
  );
}

function isResendWindowExpired({
  state,
  now,
}: ResendThrottleCheckInput): boolean {
  if (!state.resendWindowStartedAt) return true;
  return (
    millisecondsBetween({ start: state.resendWindowStartedAt, end: now }) >=
    appConfig.invitationResend.windowMs
  );
}

export function hasResendDailyCapExceeded({
  state,
  now,
}: ResendThrottleCheckInput): boolean {
  if (isResendWindowExpired({ state, now })) return false;
  return state.resendCount >= appConfig.invitationResend.dailyCap;
}

/** The throttle fields to persist once a resend is allowed through. */
export function nextResendThrottleState({
  state,
  now,
}: ResendThrottleCheckInput): Required<ResendThrottleState> {
  const windowExpired = isResendWindowExpired({ state, now });
  return {
    lastResendAt: now,
    resendCount: windowExpired ? 1 : state.resendCount + 1,
    resendWindowStartedAt: windowExpired
      ? now
      : (state.resendWindowStartedAt as Instant),
  };
}
