import { DomainError } from '@church/core';

/** A newly granted Role is missing, archived, or belongs to another Ministry or Church. */
export class InvalidMinistryRoleError extends DomainError {
  readonly code = 'INVALID_MINISTRY_ROLE' as const;

  constructor() {
    super('One or more Roles cannot be granted in this Ministry');
  }
}
