import { DomainError } from '@church/core';

/** Caps resends per invitation per day (§6.4) — stops a bouncing address from earning a sender-reputation penalty and stops `expiresAt` from being extended indefinitely. */
export class ResendDailyCapExceededError extends DomainError {
  readonly code = 'RESEND_DAILY_CAP_EXCEEDED' as const;

  constructor() {
    super('Daily resend limit reached for this invitation');
  }
}
