import type { ChurchInvitationId } from '../../branded-ids';
import type { VerificationCodeState } from '../../entities/invitation-verification-code';
import type { TransactionContext } from './transaction-context';
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

export interface RecordRedemptionOutcomeInput {
  churchInvitationId: ChurchInvitationId;
  redemptionIdempotencyKey: string;
  outcome: unknown;
  tx: TransactionContext;
}

export interface FindRedemptionOutcomeInput {
  churchInvitationId: ChurchInvitationId;
  redemptionIdempotencyKey: string;
}

export interface InvitationVerificationCodeRepository {
  /** Written in the redeem transaction, so it exists only if the redeem committed. */
  recordRedemptionOutcome(input: RecordRedemptionOutcomeInput): Promise<void>;
  /** The outcome stored under this exact key, else null. */
  findRedemptionOutcome(input: FindRedemptionOutcomeInput): Promise<unknown>;
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
