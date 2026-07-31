import { DomainError } from '@church/core';

/** A Ministry leader may mint at `volunteer` only — granting `leader` is an administrative act. */
export class InsufficientInvitationAuthorityError extends DomainError {
  readonly code = 'INSUFFICIENT_INVITATION_AUTHORITY' as const;

  constructor() {
    super('Ministry leaders may not grant leader access');
  }
}
