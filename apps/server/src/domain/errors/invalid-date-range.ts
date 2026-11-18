import { DomainError } from '@church/core';

export class InvalidDateRangeError extends DomainError {
  readonly code = 'INVALID_DATE_RANGE' as const;

  constructor() {
    super('Start date must be before end date');
  }
}
