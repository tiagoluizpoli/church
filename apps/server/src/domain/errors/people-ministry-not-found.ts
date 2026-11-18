import { DomainError } from '@church/core';

/** A People Ministry filter outside the caller's reach: missing, archived, foreign or unled look alike. */
export class PeopleMinistryNotFoundError extends DomainError {
  readonly code = 'MINISTRY_NOT_FOUND' as const;

  constructor() {
    super('Ministry not found');
  }
}
