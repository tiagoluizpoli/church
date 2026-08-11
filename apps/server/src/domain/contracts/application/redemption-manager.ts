import type {
  ChurchId,
  MinistryInvitationId,
  UserId,
  VolunteerId,
} from '../../branded-ids';

export interface AcceptPendingMinistryInvitationInput {
  churchId: ChurchId;
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  acceptedAt: Date;
  correlationId?: string;
}

export interface PublicRedemptionPreview {
  churchId: ChurchId;
  churchInvitationId: string;
  email: string;
  churchName: string;
  ministryName: string;
  ministryAccessLevel: 'volunteer' | 'leader';
  roleNames: string[];
  expiresAt: Date;
  churchInvitationStatus: 'pending' | 'accepted';
}

export interface GetPublicRedemptionPreviewInput {
  ministryInvitationId: MinistryInvitationId;
  now?: Date;
}

export interface GetDebugVerificationCodeInput {
  ministryInvitationId: MinistryInvitationId;
  now?: Date;
}

export interface RequestRedemptionCodeInput {
  ministryInvitationId: MinistryInvitationId;
  now?: Date;
}

export interface RedeemNewUserInput {
  ministryInvitationId: MinistryInvitationId;
  name: string;
  password: string;
  code: string;
  idempotencyKey: string;
  now?: Date;
}

export interface FullRedemptionSuccess {
  kind: 'full-success';
  volunteerId: VolunteerId;
  sessionCookie: string;
}

export interface ChurchOnlyRedemptionOutcome {
  kind: 'church-only';
}

export interface RetryableRedemptionFailure {
  kind: 'retryable-failure';
  reason: 'MINISTRY_ACCEPTANCE_FAILED';
}

export interface TerminalRedemptionFailure {
  kind: 'terminal-failure';
  reason: 'INVITATION_UNAVAILABLE' | 'VERIFICATION_FAILED' | 'IDENTITY_FAILED';
}

export type RedeemNewUserOutcome =
  | FullRedemptionSuccess
  | ChurchOnlyRedemptionOutcome
  | RetryableRedemptionFailure
  | TerminalRedemptionFailure;

/** Owns checkpoint three from spec §7.4; no HTTP transport is in #98. */
export interface RedemptionManager {
  getPublicPreview(
    input: GetPublicRedemptionPreviewInput,
  ): Promise<PublicRedemptionPreview | null>;
  requestVerificationCode(input: RequestRedemptionCodeInput): Promise<boolean>;
  redeemNewUser(input: RedeemNewUserInput): Promise<RedeemNewUserOutcome>;
  acceptPendingMinistryInvitation(
    input: AcceptPendingMinistryInvitationInput,
  ): Promise<VolunteerId>;
  /** Non-production support only: null in production, when the invitation
   * is unavailable, or when no code has been captured yet. */
  getDebugVerificationCode(
    input: GetDebugVerificationCodeInput,
  ): Promise<string | null>;
}
