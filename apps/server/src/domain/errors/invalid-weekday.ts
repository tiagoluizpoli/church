import { DomainError } from '@church/core';

export class InvalidWeekdayError extends DomainError {
  readonly code = 'INVALID_WEEKDAY' as const;

  constructor() {
    super('Weekday must be between 0 and 6');
  }
}
