import { DomainError } from '@church/core';

export class InvalidEventDurationError extends DomainError {
  readonly code = 'INVALID_EVENT_DURATION' as const;

  constructor() {
    super('Event duration must be greater than zero');
  }
}
