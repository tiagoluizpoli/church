import type { ChurchInvitationId } from '../../branded-ids';

export interface IssueInvitationVerificationCodeInput {
  churchInvitationId: ChurchInvitationId;
  recipientEmail: string;
  churchName: string;
  now?: Date;
}

export interface VerifyInvitationVerificationCodeInput {
  churchInvitationId: ChurchInvitationId;
  code: string;
  idempotencyKey?: string;
  now?: Date;
}

export interface InvitationVerificationCodeManager {
  issue(input: IssueInvitationVerificationCodeInput): Promise<void>;
  verify(input: VerifyInvitationVerificationCodeInput): Promise<void>;
}
