import { DomainError } from '@church/core';

export class ScheduleHasNoAssignmentsError extends DomainError {
  readonly code = 'SCHEDULE_HAS_NO_ASSIGNMENTS' as const;

  constructor() {
    super('A Schedule needs at least one active Assignment to publish');
  }
}

export class ScheduleAlreadyPublishedError extends DomainError {
  readonly code = 'SCHEDULE_ALREADY_PUBLISHED' as const;

  constructor() {
    super('This Schedule is already published');
  }
}
