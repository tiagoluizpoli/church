import { DomainError } from '@church/core';

export class BelowFullPublishError extends DomainError {
  readonly code = 'BELOW_FULL_PUBLISH' as const;

  constructor() {
    super('Publishing below full staffing requires confirmation');
  }
}
