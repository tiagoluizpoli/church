import { DomainError } from '@church/core';

/** The Event has ended: its history is never rewritten by an edit. */
export class EditWindowClosedError extends DomainError {
  readonly code = 'EDIT_WINDOW_CLOSED' as const;

  constructor() {
    super('Only an Event that has not ended can be edited');
  }
}
