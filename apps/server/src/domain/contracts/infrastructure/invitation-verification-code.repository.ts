import type { MinistryInvitationId } from '../../branded-ids';
import type { VerificationCodeState } from '../../entities/invitation-verification-code';
export interface ClaimVerificationCodeDeliveryInput {
  ministryInvitationId: MinistryInvitationId;
  codeHash: string;
  expiresAt: Date;
  sentAt: Date;
}

export interface FindVerificationCodeInput {
  ministryInvitationId: MinistryInvitationId;
}

export interface ReleaseVerificationCodeDeliveryClaimInput {
  ministryInvitationId: MinistryInvitationId;
  codeHash: string;
  sentAt: Date;
}

export interface ConsumeVerificationCodeIfValidInput {
  ministryInvitationId: MinistryInvitationId;
  candidateHash: string;
  consumedAt: Date;
  now: Date;
  redemptionIdempotencyKey?: string;
}

export interface RecordFailedVerificationAttemptIfAllowedInput {
  ministryInvitationId: MinistryInvitationId;
  candidateHash: string;
  now: Date;
}

export interface InvitationVerificationCodeRepository {
  find(input: FindVerificationCodeInput): Promise<VerificationCodeState | null>;
  claimDelivery(input: ClaimVerificationCodeDeliveryInput): Promise<boolean>;
  releaseDeliveryClaim(
    input: ReleaseVerificationCodeDeliveryClaimInput,
  ): Promise<void>;
  consumeIfValid(input: ConsumeVerificationCodeIfValidInput): Promise<boolean>;
  recordFailedAttemptIfAllowed(
    input: RecordFailedVerificationAttemptIfAllowedInput,
  ): Promise<boolean>;
}
