import { DomainError } from '@church/core';

export class EmptyScheduleError extends DomainError {
  readonly code = 'EMPTY_SCHEDULE' as const;

  constructor() {
    super('Cannot publish an event with no assignments');
  }
}
