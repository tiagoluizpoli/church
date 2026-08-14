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
  /** Which audit act this grant represents — defaults to 'acceptance' (the new-person chained path). */
  auditAction?: 'acceptance' | 'ministry_acceptance';
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

/**
 * Post-authentication lifecycle classification for an existing Church
 * Member's Ministry Invitation (spec §7.3) — pre-authentication, every
 * unavailable state must instead collapse to one indistinguishable response
 * at the transport layer, never reach this far.
 */
export interface GetAuthenticatedInvitationStatusInput {
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  now?: Date;
}

export interface RedeemableInvitationStatus {
  kind: 'redeemable';
  /** Distinguishes a chained pair from a Ministry-only invitation so the client can word decline correctly (spec §7.3). */
  invitationKind: 'ministry-only' | 'chained';
  email: string;
  churchName: string;
  ministryName: string;
  ministryAccessLevel: 'volunteer' | 'leader';
  roleNames: string[];
  expiresAt: Date;
}

export interface AlreadyAcceptedInvitationStatus {
  kind: 'already-accepted';
  churchId: ChurchId;
}

export interface IdentityMismatchStatus {
  kind: 'identity-mismatch';
}

export interface UnavailableInvitationStatus {
  kind: 'unavailable';
}

export type AuthenticatedInvitationStatus =
  | RedeemableInvitationStatus
  | AlreadyAcceptedInvitationStatus
  | IdentityMismatchStatus
  | UnavailableInvitationStatus;

export interface AcceptExistingMemberInput {
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  /** The caller's own Better Auth session cookie — forwarded as-is, never minted here. */
  sessionCookie: string;
  idempotencyKey: string;
  now?: Date;
}

export interface ExistingMemberRedemptionSuccess {
  kind: 'full-success';
  volunteerId: VolunteerId;
}

export type AcceptExistingMemberOutcome =
  | ExistingMemberRedemptionSuccess
  | AlreadyAcceptedInvitationStatus
  | IdentityMismatchStatus
  | RetryableRedemptionFailure
  | TerminalRedemptionFailure;

export interface DeclineInvitationInput {
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  sessionCookie: string;
  now?: Date;
}

export interface DeclinedOutcome {
  kind: 'declined';
}

export interface DeclineIdentityFailedOutcome {
  kind: 'terminal-failure';
  reason: 'INVITATION_UNAVAILABLE' | 'IDENTITY_FAILED';
}

export type DeclineInvitationOutcome =
  | DeclinedOutcome
  | IdentityMismatchStatus
  | DeclineIdentityFailedOutcome;

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
  /** Authenticated status check backing #58's existing-member preview (session 2). */
  getAuthenticatedInvitationStatus(
    input: GetAuthenticatedInvitationStatusInput,
  ): Promise<AuthenticatedInvitationStatus>;
  acceptExistingMember(
    input: AcceptExistingMemberInput,
  ): Promise<AcceptExistingMemberOutcome>;
  declineInvitation(
    input: DeclineInvitationInput,
  ): Promise<DeclineInvitationOutcome>;
  /** Non-production support only: null in production, when the invitation
   * is unavailable, or when no code has been captured yet. */
  getDebugVerificationCode(
    input: GetDebugVerificationCodeInput,
  ): Promise<string | null>;
}
