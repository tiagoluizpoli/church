import { DomainError } from '@church/core';

export class IsolationBreachError extends DomainError {
  readonly code = 'ISOLATION_BREACH' as const;

  constructor(message = 'Isolation breach: Church ID mismatch') {
    super(message);
  }
}
