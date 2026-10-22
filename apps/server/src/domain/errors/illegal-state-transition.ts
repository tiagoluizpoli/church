import { DomainError } from '@church/core';

export interface IllegalStateTransitionErrorInput {
  from: string;
  to: string;
}

export class IllegalStateTransitionError extends DomainError {
  readonly code = 'ILLEGAL_STATE_TRANSITION' as const;

  constructor({ from, to }: IllegalStateTransitionErrorInput) {
    super(`Cannot transition from ${from} to ${to}`);
  }
}
