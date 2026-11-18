import { DomainError } from '@church/core';
import type { ChurchId } from '../branded-ids';

export interface CrossChurchVolunteerConflictInput {
  /** The Church whose active Volunteer profile the redeemer already holds. */
  sourceChurchId: ChurchId;
}

/**
 * Spec §7.5: the redeemer already holds an *active* Volunteer profile in
 * another Church, so the one-active-profile rule refuses the Ministry half of
 * this invitation by name. Church Membership is unaffected — it is granted
 * before checkpoint three — and the Ministry Invitation stays `pending` so a
 * Volunteer Transfer (§8) can still redeem it later. Nothing is reassigned;
 * this error is thrown before any write.
 */
export class CrossChurchVolunteerConflictError extends DomainError {
  readonly code = 'CROSS_CHURCH_VOLUNTEER_CONFLICT' as const;
  readonly sourceChurchId: ChurchId;

  constructor({ sourceChurchId }: CrossChurchVolunteerConflictInput) {
    super(
      'Redeemer already holds an active Volunteer profile in another Church',
    );
    this.sourceChurchId = sourceChurchId;
  }
}
