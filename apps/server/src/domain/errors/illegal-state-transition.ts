import { DomainError } from '@church/core';

export class IllegalStateTransitionError extends DomainError {
  readonly code = 'ILLEGAL_STATE_TRANSITION' as const;

  constructor(from: string, to: string) {
    super(`Cannot transition from ${from} to ${to}`);
  }
}
