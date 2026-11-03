import { DomainError } from '@church/core';

/** An in-scope offer already accepted, declined or revoked, or whose Church parent is: never revived. */
export class InvitationNotPendingError extends DomainError {
  readonly code = 'INVITATION_NOT_PENDING' as const;

  constructor() {
    super('Invitation is no longer pending');
  }
}
