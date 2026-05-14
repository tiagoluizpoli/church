import { DomainError } from '@church/core';

export class InvalidDateRangeError extends DomainError {
  constructor() {
    super('Start date must be before end date');
  }
}
