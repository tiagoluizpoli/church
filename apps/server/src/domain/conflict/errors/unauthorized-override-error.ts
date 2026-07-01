import { DomainError } from '@church/core';

export class UnauthorizedOverrideError extends DomainError {
  readonly code = 'UNAUTHORIZED_OVERRIDE' as const;
}
