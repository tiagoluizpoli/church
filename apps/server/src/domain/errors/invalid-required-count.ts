import { DomainError } from '@church/core';

export class InvalidRequiredCountError extends DomainError {
  readonly code = 'INVALID_REQUIRED_COUNT' as const;

  constructor() {
    super('Required count must be at least 1');
  }
}
