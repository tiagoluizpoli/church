import { DomainError } from '@church/core';

export class CancelWindowClosedError extends DomainError {
  readonly code = 'CANCEL_WINDOW_CLOSED';

  constructor() {
    super(
      'Too close to the shift start to self-cancel; ask your leader to reassign it',
    );
  }
}
