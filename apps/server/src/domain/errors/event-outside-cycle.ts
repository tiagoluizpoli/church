import { DomainError } from '@church/core';

export class EventOutsideCycleError extends DomainError {
  readonly code = 'EVENT_OUTSIDE_CYCLE' as const;

  constructor() {
    super('Event start date must fall within the cycle');
  }
}
