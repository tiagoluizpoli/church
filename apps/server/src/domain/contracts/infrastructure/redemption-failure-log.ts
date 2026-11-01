import type { MinistryInvitationId } from '../../branded-ids';

/** Only identifiers and the failure class: never credentials, codes or cookies. */
export interface RedemptionFailureEntry {
  reason:
    | 'IDENTITY_FAILED'
    | 'MINISTRY_ACCEPTANCE_FAILED'
    | 'EMAIL_ALREADY_REGISTERED';
  ministryInvitationId: MinistryInvitationId;
  correlationId: string;
  errorName: string;
}

export interface RedemptionFailureLog {
  record(entry: RedemptionFailureEntry): void;
}
