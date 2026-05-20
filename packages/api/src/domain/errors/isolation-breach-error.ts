import { DomainError } from '@church/core';

export class IsolationBreachError extends DomainError {
  constructor(message = 'Isolation breach: Church ID mismatch') {
    super(message);
  }
}
