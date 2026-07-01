import { DomainError } from '@church/core';

export class InvalidOverrideReasonError extends DomainError {
  readonly code = 'INVALID_OVERRIDE_REASON' as const;

  constructor() {
    super('Override reason must be a non-empty string');
  }
}
