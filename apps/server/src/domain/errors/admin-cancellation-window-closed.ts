import { DomainError } from '@church/core';

/**
 * A ChurchAdmin tried to cancel an Event or EventTimeBlock at or after its
 * start. Distinct from `CANCEL_WINDOW_CLOSED`, the Volunteer's Assignment
 * self-cancellation refusal.
 */
export class AdminCancellationWindowClosedError extends DomainError {
  readonly code = 'ADMIN_CANCELLATION_WINDOW_CLOSED' as const;

  constructor() {
    super(
      'Only an Event or EventTimeBlock that has not started can be cancelled',
    );
  }
}
