import { DomainError } from '@church/core';

/** Send refuses a Draft Cycle that has no Event to hand off. */
export class EmptyCycleError extends DomainError {
  readonly code = 'EMPTY_CYCLE' as const;

  constructor() {
    super('A Cycle needs at least one Event before it can be sent');
  }
}
