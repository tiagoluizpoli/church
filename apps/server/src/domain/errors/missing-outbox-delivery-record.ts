import { DomainError } from '@church/core';

export interface MissingOutboxDeliveryRecordErrorInput {
  ministryInvitationId: string;
}

/**
 * Both `mint` and `resend` enqueue exactly one outbox message before
 * returning, so a missing row here is an invariant violation, not a valid
 * API state — never expected to actually be thrown.
 */
export class MissingOutboxDeliveryRecordError extends DomainError {
  readonly code = 'MISSING_OUTBOX_DELIVERY_RECORD' as const;

  constructor({ ministryInvitationId }: MissingOutboxDeliveryRecordErrorInput) {
    super(
      `No outbox message found for Ministry Invitation ${ministryInvitationId}`,
    );
  }
}
