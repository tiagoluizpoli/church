import { DomainError } from '@church/core';

/** A write (an Assignment or a preparation) targets a cancelled Event. */
export class EventCancelledError extends DomainError {
  readonly code = 'EVENT_CANCELLED' as const;

  constructor() {
    super('Cannot change a cancelled Event');
  }
}

/** A write (an Assignment or a preparation) targets a cancelled EventTimeBlock. */
export class EventTimeBlockCancelledError extends DomainError {
  readonly code = 'EVENT_TIME_BLOCK_CANCELLED' as const;

  constructor() {
    super('Cannot change a cancelled EventTimeBlock');
  }
}
