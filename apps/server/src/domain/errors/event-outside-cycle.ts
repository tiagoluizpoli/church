import { DomainError } from '@church/core';

export class EventOutsidePlanningCycleError extends DomainError {
  readonly code = 'EVENT_OUTSIDE_PLANNING_CYCLE' as const;

  constructor() {
    super('Event start date must fall within the planning cycle');
  }
}
