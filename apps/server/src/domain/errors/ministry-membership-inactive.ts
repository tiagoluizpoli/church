import { DomainError } from '@church/core';

/** The Ministry Membership already ended; nothing about it changes again. */
export class MinistryMembershipInactiveError extends DomainError {
  readonly code = 'MINISTRY_MEMBERSHIP_INACTIVE' as const;

  constructor() {
    super('The Ministry Membership has already ended');
  }
}
