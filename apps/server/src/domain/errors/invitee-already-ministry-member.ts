import { DomainError } from '@church/core';

export class InviteeAlreadyMinistryMemberError extends DomainError {
  readonly code = 'INVITEE_ALREADY_MINISTRY_MEMBER' as const;

  constructor() {
    super('Invitee already holds Ministry Membership in this Ministry');
  }
}
