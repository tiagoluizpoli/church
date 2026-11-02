import { DomainError } from '@church/core';

export interface DraftStaffingReconciliationRequiredErrorInput {
  cycleId: string;
}

/**
 * A Draft Cycle already holds staffing whose provisional origin cannot be
 * proven, so Send refuses rather than replace or duplicate it.
 */
export class DraftStaffingReconciliationRequiredError extends DomainError {
  readonly code = 'DRAFT_STAFFING_RECONCILIATION_REQUIRED';

  constructor({ cycleId }: DraftStaffingReconciliationRequiredErrorInput) {
    super(
      `Draft Cycle ${cycleId} already has staffing; reconcile it before sending`,
    );
  }
}
