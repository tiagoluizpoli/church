import type { Instant } from '@church/time';

export interface ResendThrottleState {
  lastResendAt?: Instant;
  resendCount: number;
  resendWindowStartedAt?: Instant;
}

export interface ResendThrottlePolicy {
  cooldownMs: number;
  dailyCap: number;
  windowMs: number;
}

export interface ResendThrottleCheckInput {
  state: ResendThrottleState;
  policy: ResendThrottlePolicy;
  now: Instant;
}
