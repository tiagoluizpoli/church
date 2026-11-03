import { DomainError } from '@church/core';

/** A stored-pending admin Church offer, expired or not, already addresses this person. */
export class PendingChurchInvitationExistsError extends DomainError {
  readonly code = 'PENDING_CHURCH_INVITATION_EXISTS' as const;

  constructor() {
    super('A pending admin Church Invitation already addresses this person');
  }
}
