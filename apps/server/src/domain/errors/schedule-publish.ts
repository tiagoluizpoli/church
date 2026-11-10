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

export class NoUnsentChangesError extends DomainError {
  readonly code = 'NO_UNSENT_CHANGES' as const;
  constructor() {
    super('No Volunteers have unsent Schedule changes');
  }
}
