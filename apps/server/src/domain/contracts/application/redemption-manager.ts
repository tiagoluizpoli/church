import type {
  ChurchId,
  ChurchInvitationId,
  MinistryInvitationId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type {
  PublicRedemptionMinistry,
  PublicRedemptionPreview,
} from '../../entities/public-redemption-preview';

export interface AcceptPendingMinistryInvitationInput {
  churchId: ChurchId;
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  acceptedAt: Date;
  correlationId?: string;
  /** Which audit act this grant represents — defaults to 'acceptance' (the new-person chained path). */
  auditAction?: 'acceptance' | 'ministry_acceptance';
}

export type { PublicRedemptionMinistry, PublicRedemptionPreview };

export interface GetPublicRedemptionPreviewInput {
  churchInvitationId: ChurchInvitationId;
  now?: Date;
}

export interface GetDebugVerificationCodeInput {
  churchInvitationId: ChurchInvitationId;
  now?: Date;
}

export interface RequestRedemptionCodeInput {
  churchInvitationId: ChurchInvitationId;
  now?: Date;
}

export interface RedeemNewUserInput {
  churchInvitationId: ChurchInvitationId;
  name: string;
  password: string;
  code: string;
  idempotencyKey: string;
  now?: Date;
}

/** A plain Church Invitation admits a Church Member only: no Volunteer. */
export interface FullRedemptionSuccess {
  kind: 'full-success';
  volunteerId: VolunteerId | null;
  sessionCookie: string;
}

/**
 * Spec §7.5: the redeemer already holds an active Volunteer profile in another
 * Church. Church Membership succeeded; the Ministry half was refused by name.
 * Both Churches are named so the result screen can explain the
 * one-active-Volunteer-profile rule and offer a Volunteer Transfer (§8), which
 * is why the (still `pending`) `ministryInvitationId` is echoed back.
 */
export interface ChurchOnlyRedemptionOutcome {
  kind: 'church-only';
  /** The Church whose active Volunteer profile blocked the Ministry grant. */
  sourceChurchName: string;
  /** The invitation's Church, now the redeemer's Active Church. */
  destinationChurchName: string;
  destinationChurchId: ChurchId;
  ministryInvitationId: MinistryInvitationId;
  /** The invited Ministry the warning names. */
  ministryName: string;
}

export interface RetryableRedemptionFailure {
  kind: 'retryable-failure';
  reason: 'MINISTRY_ACCEPTANCE_FAILED';
}

export interface TerminalRedemptionFailure {
  kind: 'terminal-failure';
  reason: 'INVITATION_UNAVAILABLE' | 'VERIFICATION_FAILED' | 'IDENTITY_FAILED';
}

/** A committed Church-only join: the new session is kept. */
export interface NewPersonChurchOnlyOutcome
  extends ChurchOnlyRedemptionOutcome {
  sessionCookie: string;
}

/** Every new-person write was rolled back; the same invitation can be retried. */
export interface RetryableNewPersonFailure {
  kind: 'retryable-failure';
  reason: 'IDENTITY_FAILED' | 'MINISTRY_ACCEPTANCE_FAILED';
}

export interface TerminalNewPersonFailure {
  kind: 'terminal-failure';
  reason:
    | 'INVITATION_UNAVAILABLE'
    | 'VERIFICATION_FAILED'
    | 'EMAIL_ALREADY_REGISTERED';
}

export type RedeemNewUserOutcome =
  | FullRedemptionSuccess
  | NewPersonChurchOnlyOutcome
  | RetryableNewPersonFailure
  | TerminalNewPersonFailure;

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

/** The status read also tells a wrong login who the invitation was addressed to, masked. */
export interface MaskedIdentityMismatchStatus extends IdentityMismatchStatus {
  maskedEmail: string;
}

export interface UnavailableInvitationStatus {
  kind: 'unavailable';
}

export type AuthenticatedInvitationStatus =
  | RedeemableInvitationStatus
  | AlreadyAcceptedInvitationStatus
  | MaskedIdentityMismatchStatus
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
  | ChurchOnlyRedemptionOutcome
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
