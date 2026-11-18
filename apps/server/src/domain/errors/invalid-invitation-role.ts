import { DomainError } from '@church/core';

/** A requested Role does not exist, or belongs to a different Ministry. */
export class InvalidInvitationRoleError extends DomainError {
  readonly code = 'INVALID_INVITATION_ROLE' as const;

  constructor() {
    super('One or more Roles are invalid for this Ministry');
  }
}
