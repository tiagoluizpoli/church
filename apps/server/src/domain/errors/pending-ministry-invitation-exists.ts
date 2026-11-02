import { DomainError } from '@church/core';
import type { Instant } from '@church/time';

/** The original offer, returned only after the caller's scope was checked. */
export interface ExistingInvitationReference {
  id: string;
  createdAt: Instant;
}

interface PendingMinistryInvitationExistsErrorInput {
  /** Absent only when the database backstop, not the locked recheck, caught the race. */
  existingInvitation?: ExistingInvitationReference;
}

/** A stored-pending offer, expired or not, already addresses this person in this Ministry. */
export class PendingMinistryInvitationExistsError extends DomainError {
  readonly code = 'PENDING_MINISTRY_INVITATION_EXISTS' as const;
  readonly existingInvitation?: ExistingInvitationReference;

  constructor({
    existingInvitation,
  }: PendingMinistryInvitationExistsErrorInput) {
    super('A pending Ministry Invitation already addresses this person');
    this.existingInvitation = existingInvitation;
  }
}
