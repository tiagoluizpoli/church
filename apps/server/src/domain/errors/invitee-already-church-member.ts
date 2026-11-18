import { DomainError } from '@church/core';

/** Admin access for an existing Church Member is changed in People, not by invitation. */
export class InviteeAlreadyChurchMemberError extends DomainError {
  readonly code = 'INVITEE_ALREADY_CHURCH_MEMBER' as const;

  constructor() {
    super('Invitee already holds Church Membership in this Church');
  }
}
