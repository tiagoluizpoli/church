import { DomainError } from '@church/core';

export class CrossMinistryScopeError extends DomainError {
  readonly code = 'CROSS_MINISTRY_SCOPE' as const;

  constructor() {
    super('Resource belongs to another ministry');
  }
}
