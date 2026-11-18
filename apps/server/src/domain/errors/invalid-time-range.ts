import { DomainError } from '@church/core';

export class InvalidTimeRangeError extends DomainError {
  readonly code = 'INVALID_TIME_RANGE' as const;

  constructor(message = 'Start time must be before end time') {
    super(message);
  }
}
