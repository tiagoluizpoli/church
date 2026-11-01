import type { ChurchInvitationId } from '../../branded-ids';
import type { VerificationCodeState } from '../../entities/invitation-verification-code';
export interface ClaimVerificationCodeDeliveryInput {
  churchInvitationId: ChurchInvitationId;
  codeHash: string;
  expiresAt: Date;
  sentAt: Date;
}

export interface FindVerificationCodeInput {
  churchInvitationId: ChurchInvitationId;
}

export interface ReleaseVerificationCodeDeliveryClaimInput {
  churchInvitationId: ChurchInvitationId;
  codeHash: string;
  sentAt: Date;
}

export interface ConsumeVerificationCodeIfValidInput {
  churchInvitationId: ChurchInvitationId;
  candidateHash: string;
  consumedAt: Date;
  now: Date;
  redemptionIdempotencyKey?: string;
}

export interface RecordFailedVerificationAttemptIfAllowedInput {
  churchInvitationId: ChurchInvitationId;
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
