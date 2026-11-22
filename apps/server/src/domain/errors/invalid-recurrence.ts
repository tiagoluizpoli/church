import { DomainError } from '@church/core';

export class InvalidRecurrenceError extends DomainError {
  readonly code = 'INVALID_RECURRENCE' as const;

  constructor() {
    super('Recurrence must name valid weekdays or monthly entries');
  }
}
