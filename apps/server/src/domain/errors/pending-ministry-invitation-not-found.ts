import { DomainError } from '@church/core';

export class PendingMinistryInvitationNotFoundError extends DomainError {
  readonly code = 'PENDING_MINISTRY_INVITATION_NOT_FOUND' as const;

  constructor() {
    super('Pending ministry invitation not found');
  }
}
