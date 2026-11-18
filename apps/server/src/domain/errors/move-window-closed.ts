import { DomainError } from '@church/core';

/** The move scope has already started, or the target start is not in the future. */
export class MoveWindowClosedError extends DomainError {
  readonly code = 'MOVE_WINDOW_CLOSED' as const;

  constructor() {
    super('Only a scope that has not started can be moved to a future start');
  }
}
