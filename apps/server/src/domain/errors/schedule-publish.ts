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

/** Apply's pairs, token or key do not match what was reviewed (ADR 0013). */
export class AssignmentProposalChangedError extends DomainError {
  readonly code = 'ASSIGNMENT_PROPOSAL_CHANGED' as const;
  constructor() {
    super('These additions are not the reviewed Assignment proposal');
  }
}

/** A reviewed pair no longer passes eligibility; nothing was applied. */
export class AssignmentProposalStaleError extends DomainError {
  readonly code = 'ASSIGNMENT_PROPOSAL_STALE' as const;
  constructor() {
    super('The reviewed Assignment proposal is out of date');
  }
}
