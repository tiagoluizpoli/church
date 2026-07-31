import { DomainError } from '@church/core';

/** Manual resend is rate-limited (§6.4) to protect sender reputation and prevent an unbounded resend loop. */
export class ResendCooldownActiveError extends DomainError {
  readonly code = 'RESEND_COOLDOWN_ACTIVE' as const;

  constructor() {
    super('Resend is rate-limited; wait before trying again');
  }
}
