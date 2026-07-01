import { DomainError } from '@church/core';

export class PastEventError extends DomainError {
  readonly code = 'PAST_EVENT' as const;

  constructor() {
    super('Cannot publish an event that has already started or is in the past');
  }
}
