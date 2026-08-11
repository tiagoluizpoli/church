import type { MinistryInvitationId } from '../../branded-ids';

export interface IssueInvitationVerificationCodeInput {
  ministryInvitationId: MinistryInvitationId;
  recipientEmail: string;
  churchName: string;
  now?: Date;
}

export interface VerifyInvitationVerificationCodeInput {
  ministryInvitationId: MinistryInvitationId;
  code: string;
  idempotencyKey?: string;
  now?: Date;
}

export interface InvitationVerificationCodeManager {
  issue(input: IssueInvitationVerificationCodeInput): Promise<void>;
  verify(input: VerifyInvitationVerificationCodeInput): Promise<void>;
}
