import type { ChurchId, MinistryId, RoleId, UserId } from '../../branded-ids';
import type { MinistryInvitation } from '../../entities/ministry-invitation';
import type { MinistryAccessLevel } from '../../entities/ministry-volunteer';
import type { TransactionContext } from './transaction-context';

export interface AcquireMintLockInput {
  ministryId: MinistryId;
  email: string;
  tx: TransactionContext;
}

export interface AcquireResendLockInput {
  ministryInvitationId: string;
  tx: TransactionContext;
}

export interface FindChurchMemberByEmailInput {
  churchId: ChurchId;
  email: string;
  tx?: TransactionContext;
}

export interface FindPendingByInviteeInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  inviteeUserId: UserId;
  tx?: TransactionContext;
}

export interface FindPendingByChurchInvitationInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  churchInvitationId: string;
  tx?: TransactionContext;
}

export interface FindPendingByIdInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  ministryInvitationId: string;
  tx?: TransactionContext;
}

export interface HasActiveMinistryMembershipInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  userId: UserId;
  tx?: TransactionContext;
}

export interface FindPendingChurchInvitationByEmailInput {
  churchId: ChurchId;
  email: string;
  tx?: TransactionContext;
}

export interface ChurchInvitationSummary {
  id: string;
  expiresAt: Date;
}

export interface CreateChainedChurchInvitationInput {
  churchId: ChurchId;
  email: string;
  inviterId: UserId;
  tx?: TransactionContext;
}

export interface CreateMinistryInvitationInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  ministryAccessLevel: MinistryAccessLevel;
  inviterId: UserId;
  inviteeUserId?: UserId;
  churchInvitationId?: string;
  roleIds: RoleId[];
  expiresAt: Date;
  tx?: TransactionContext;
}

export interface RefreshMinistryInvitationExpiryInput {
  churchId: ChurchId;
  ministryInvitation: MinistryInvitation;
  expiresAt: Date;
  tx?: TransactionContext;
}

export interface ResendThrottleFields {
  lastResendAt: Date;
  resendCount: number;
  resendWindowStartedAt: Date;
}

export interface ApplyResendInput {
  churchId: ChurchId;
  ministryInvitation: MinistryInvitation;
  expiresAt: Date;
  throttle: ResendThrottleFields;
  tx?: TransactionContext;
}

export interface FindByIdInput {
  churchId: ChurchId;
  ministryInvitationId: string;
  tx?: TransactionContext;
}

export interface ResolveRecipientEmailInput {
  ministryInvitation: MinistryInvitation;
  tx?: TransactionContext;
}

export interface PublicRedemptionPreview {
  ministryInvitationId: string;
  churchId: ChurchId;
  churchInvitationId: string;
  email: string;
  churchName: string;
  ministryName: string;
  ministryAccessLevel: MinistryAccessLevel;
  roleNames: string[];
  expiresAt: Date;
  churchInvitationStatus: 'pending' | 'accepted';
}

export interface FindPublicRedemptionPreviewInput {
  ministryInvitationId: string;
  now: Date;
  includeAcceptedChurchInvitation?: boolean;
}

export interface FindMinistryInvitationContextInput {
  ministryInvitationId: string;
  tx?: TransactionContext;
}

/**
 * Any-status, kind-agnostic lookup for the existing-member/lifecycle-branch
 * flows — unlike `findPublicRedemptionPreview`, this does not filter on
 * `status`/`expiresAt` or require a chained Church Invitation to exist, so
 * the caller (application layer) classifies redeemable / already-accepted /
 * unavailable itself. Returning `null` only for a nonexistent id keeps the
 * same "collapse to null" shape `findPublicRedemptionPreview` uses.
 */
export interface MinistryInvitationContext {
  ministryInvitation: MinistryInvitation;
  /** Only set for a chained invitation. */
  churchInvitationStatus?: 'pending' | 'accepted' | 'rejected' | 'canceled';
  churchName: string;
  ministryName: string;
  roleNames: string[];
}

export interface IsInvitationAddressedToUserInput {
  ministryInvitation: MinistryInvitation;
  userId: UserId;
  tx?: TransactionContext;
}

export interface EnqueueOutboxMessageInput {
  churchId: ChurchId;
  kind:
    | 'invitation.chained'
    | 'invitation.ministry'
    | 'invitation.church-bootstrap'
    | 'transfer.ministry-digest'
    | 'transfer.leaderless-ministry';
  payload: Record<string, unknown>;
  correlationId: string;
  scheduledFor: Date;
  tx?: TransactionContext;
}

export interface MinistryInvitationRepository {
  /**
   * Serializes concurrent mints for the same (Ministry, email) pair behind a
   * transaction-scoped advisory lock, so two simultaneous re-invites can't
   * both observe "no pending row" and both attempt `create` — the second
   * would otherwise hit the partial unique index as a raw constraint
   * violation instead of the idempotent refresh the caller expects.
   */
  acquireMintLock(input: AcquireMintLockInput): Promise<void>;

  /**
   * Serializes concurrent resends of the same invitation behind a
   * transaction-scoped advisory lock, so two simultaneous resend calls can't
   * both read the same cooldown/cap state and both pass the check — the
   * same failure mode `acquireMintLock` prevents for concurrent mints.
   */
  acquireResendLock(input: AcquireResendLockInput): Promise<void>;

  /** The userId of an existing Church Member whose email matches — `null` for anyone else. */
  findChurchMemberByEmail(
    input: FindChurchMemberByEmailInput,
  ): Promise<UserId | null>;

  findPendingByInvitee(
    input: FindPendingByInviteeInput,
  ): Promise<MinistryInvitation | null>;

  findPendingByChurchInvitation(
    input: FindPendingByChurchInvitationInput,
  ): Promise<MinistryInvitation | null>;

  /** Scoped to Church and Ministry, and to `pending` — resend's target must already be redeemable. */
  findPendingById(
    input: FindPendingByIdInput,
  ): Promise<MinistryInvitation | null>;

  /**
   * Any status, scoped only to Church — the outbox worker re-reads by id
   * (from the outbox payload, which carries no Ministry) to check whether an
   * invitation is still `pending` before it sends.
   */
  findById(input: FindByIdInput): Promise<MinistryInvitation | null>;

  /**
   * The invitation's single addressee, resolved to an email: the existing
   * Church Member's account email, or the chained Church Invitation's email.
   */
  resolveRecipientEmail(input: ResolveRecipientEmailInput): Promise<string>;

  /**
   * Public redemption lookup. All unavailable lifecycle states deliberately
   * collapse to null so transport never reveals why a link cannot be used.
   */
  findPublicRedemptionPreview(
    input: FindPublicRedemptionPreviewInput,
  ): Promise<PublicRedemptionPreview | null>;

  /** Kind-agnostic, any-status lookup backing the existing-member and decline flows (§7.3). */
  findMinistryInvitationContext(
    input: FindMinistryInvitationContextInput,
  ): Promise<MinistryInvitationContext | null>;

  /**
   * A ministry-only invitation is addressed to `inviteeUserId` directly; a
   * chained invitation is addressed to whoever holds its Church Invitation's
   * email, checked without loading that email into the caller.
   */
  isInvitationAddressedToUser(
    input: IsInvitationAddressedToUserInput,
  ): Promise<boolean>;

  hasActiveMinistryMembership(
    input: HasActiveMinistryMembershipInput,
  ): Promise<boolean>;

  /** A still-pending chained Church Invitation previously minted for this email, if any — re-inviting must reuse it rather than mint a second one. */
  findPendingChurchInvitationByEmail(
    input: FindPendingChurchInvitationByEmailInput,
  ): Promise<ChurchInvitationSummary | null>;

  /** Writes a chained Better Auth `invitation` row directly, the same way Church Provisioning does. */
  createChainedChurchInvitation(
    input: CreateChainedChurchInvitationInput,
  ): Promise<ChurchInvitationSummary>;

  create(input: CreateMinistryInvitationInput): Promise<MinistryInvitation>;

  refreshExpiry(
    input: RefreshMinistryInvitationExpiryInput,
  ): Promise<MinistryInvitation>;

  /** Refreshes `expiresAt` and persists resend-throttle bookkeeping in one write — resend's variant of `refreshExpiry`. */
  applyResend(input: ApplyResendInput): Promise<MinistryInvitation>;

  enqueueOutboxMessage(input: EnqueueOutboxMessageInput): Promise<void>;
}
