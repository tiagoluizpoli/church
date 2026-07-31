/** Manual resend cooldown, matching §7's verification-code cooldown. */
export const RESEND_COOLDOWN_MS = 60_000;

/** Per-invitation daily resend cap (§6.4) — resets on a rolling 24h window. */
export const RESEND_DAILY_CAP = 10;

const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ResendThrottleState {
  lastResendAt?: Date;
  resendCount: number;
  resendWindowStartedAt?: Date;
}

export interface ResendThrottleCheckInput {
  state: ResendThrottleState;
  now: Date;
}

export function isResendCooldownActive({
  state,
  now,
}: ResendThrottleCheckInput): boolean {
  if (!state.lastResendAt) return false;
  return now.getTime() - state.lastResendAt.getTime() < RESEND_COOLDOWN_MS;
}

function isResendWindowExpired({
  state,
  now,
}: ResendThrottleCheckInput): boolean {
  if (!state.resendWindowStartedAt) return true;
  return (
    now.getTime() - state.resendWindowStartedAt.getTime() >= RESEND_WINDOW_MS
  );
}

export function hasResendDailyCapExceeded({
  state,
  now,
}: ResendThrottleCheckInput): boolean {
  if (isResendWindowExpired({ state, now })) return false;
  return state.resendCount >= RESEND_DAILY_CAP;
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
      : (state.resendWindowStartedAt as Date),
  };
}
