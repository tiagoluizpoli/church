import { DomainError } from '@church/core';

/** An Assignment targets a Shift whose Event was cancelled. */
export class EventCancelledError extends DomainError {
  readonly code = 'EVENT_CANCELLED' as const;

  constructor() {
    super('Cannot assign to a Shift of a cancelled Event');
  }
}

/** An Assignment targets a Shift whose EventTimeBlock was cancelled. */
export class EventTimeBlockCancelledError extends DomainError {
  readonly code = 'EVENT_TIME_BLOCK_CANCELLED' as const;

  constructor() {
    super('Cannot assign to a Shift of a cancelled EventTimeBlock');
  }
}
