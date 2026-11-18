import { DomainError } from '@church/core';

/** A volunteer-level Ministry Membership must keep at least one Role. */
export class MinistryRoleRequiredError extends DomainError {
  readonly code = 'MINISTRY_ROLE_REQUIRED' as const;

  constructor() {
    super('A volunteer-level Ministry Membership needs a Role');
  }
}
