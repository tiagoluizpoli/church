import { DomainError } from '@church/core';

export class InvalidEventDurationError extends DomainError {
  constructor() {
    super('Event duration must be greater than zero');
  }
}
