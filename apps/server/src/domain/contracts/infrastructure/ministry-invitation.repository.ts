import type { Instant } from '@church/time';
import type {
  ChurchId,
  ChurchInvitationId,
  MinistryId,
  RoleId,
  UserId,
} from '../../branded-ids';
import type { MinistryInvitation } from '../../entities/ministry-invitation';
import type { MinistryAccessLevel } from '../../entities/ministry-membership';
import type { PublicRedemptionPreview } from '../../entities/public-redemption-preview';
import type { TransactionContext } from './transaction-context';

export interface AcquireMintLockInput {
  ministryId: MinistryId;
  email: string;
  tx: TransactionContext;
}

export interface AcquireChurchOfferLockInput {
  churchId: ChurchId;
  /** Already normalized (`normalizeInvitationEmail`). */
  email: string;
  tx: TransactionContext;
}

export interface FindPendingForAddressInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  /** Already normalized (`normalizeInvitationEmail`). */
  email: string;
  tx?: TransactionContext;
}

export interface PendingMinistryInvitationReference {
  id: string;
  createdAt: Instant;
}

export interface AlignPairedExpiryInput {
  churchId: ChurchId;
  churchInvitationId: string;
  expiresAt: Date;
  tx?: TransactionContext;
}

export interface SupersedeUnsentChainedOutboxInput {
  churchId: ChurchId;
  churchInvitationId: string;
  tx?: TransactionContext;
}

export interface FindChurchMemberByEmailInput {
  churchId: ChurchId;
  email: string;
  tx?: TransactionContext;
}

export interface LockMinistryInvitationInput {
  churchId: ChurchId;
  ministryInvitationId: string;
  tx: TransactionContext;
}

export interface LockChurchInvitationInput {
  churchId: ChurchId;
  churchInvitationId: string;
  tx: TransactionContext;
}

export type ChurchInvitationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'canceled';

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

export type ChurchInvitationAccessLevel = 'member' | 'admin';

export interface ChurchInvitationSummary {
  id: string;
  expiresAt: Date;
  churchAccessLevel: ChurchInvitationAccessLevel;
}

export interface CreateChurchInvitationInput {
  churchId: ChurchId;
  email: string;
  inviterId: UserId;
  churchAccessLevel: ChurchInvitationAccessLevel;
  tx?: TransactionContext;
}

export interface UpgradeChurchInvitationToAdminInput {
  churchId: ChurchId;
  churchInvitationId: string;
  tx: TransactionContext;
}

export interface FindPendingChurchOfferInput {
  churchId: ChurchId;
  churchInvitationId: string;
}

/** A pending Church offer as its T1 describes it: the grant and every pending half. */
export interface PendingChurchOffer {
  email: string;
  churchAccessLevel: ChurchInvitationAccessLevel;
  expiresAt: Date;
  /** Oldest first. */
  pendingMinistryInvitationIds: string[];
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

export interface FindPublicRedemptionPreviewInput {
  churchInvitationId: ChurchInvitationId;
  now: Date;
}

export interface FindPendingSiblingMinistryInvitationsInput {
  churchInvitationId: string;
  /** The half already being redeemed; excluded from the result. */
  exceptMinistryInvitationId: string;
  now: Date;
  tx?: TransactionContext;
}

export interface FindMinistryInvitationContextInput {
  ministryInvitationId: string;
  tx?: TransactionContext;
}

/**
 * Any-status, kind-agnostic lookup for the existing-member/lifecycle-branch
 * flows — unlike `findPublicRedemptionPreview`, this does not filter on
 * `status`/`expiresAt`, so
 * the caller (application layer) classifies redeemable / already-accepted /
 * unavailable itself. Returning `null` only for a nonexistent id keeps the
 * same "collapse to null" shape `findPublicRedemptionPreview` uses.
 */
export interface MinistryInvitationContext {
  ministryInvitation: MinistryInvitation;
  /** Only set for a chained invitation. */
  churchInvitationStatus?: 'pending' | 'accepted' | 'rejected' | 'canceled';
  /** The invited address — the existing User's own email, or the chained Church Invitation's. */
  email: string;
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
  kind: 'invitation.chained' | 'invitation.church-bootstrap';
  payload: Record<string, unknown>;
  correlationId: string;
  scheduledFor: Date;
  tx?: TransactionContext;
}

export interface MinistryInvitationRepository {
  /**
   * Serializes concurrent mints for the same (Ministry, normalized email)
   * pair behind a transaction-scoped advisory lock, so two simultaneous
   * invites can't both observe "no pending row" and both attempt `create`.
   * The partial unique indexes stay as the backstop.
   */
  acquireMintLock(input: AcquireMintLockInput): Promise<void>;

  /**
   * Serializes every Church-offer resolution for one (Active Church, address)
   * behind a transaction-scoped advisory lock: paired Ministry mint and the
   * admin invite share it.
   *
   * Lock order for every invitation lifecycle transition (mint, admin
   * upgrade, resend, and later revoke/archive), each step optional:
   * 1. this lock, then `acquireMintLock` (address serialization);
   * 2. the Ministry row (`MinistryRepository.lockActive`: share for use,
   *    update for archive);
   * 3. the Church Invitation row (`lockChurchInvitation` or the row-locking
   *    `findPendingChurchInvitationByEmail`);
   * 4. Ministry Invitation rows (`lockMinistryInvitation`, or conditional
   *    `status = 'pending'` writes such as `alignPairedExpiry`).
   * All take the caller's transaction and hold until it ends; lifecycle and
   * throttle facts are re-read after the locks, never before.
   */
  acquireChurchOfferLock(input: AcquireChurchOfferLockInput): Promise<void>;

  /** The userId of an existing Church Member whose email matches — `null` for anyone else. */
  findChurchMemberByEmail(
    input: FindChurchMemberByEmailInput,
  ): Promise<UserId | null>;

  /**
   * The stored-pending Ministry offer, expired included, addressed to this
   * address in this Ministry — directly to the Member holding it or through
   * a Church Invitation sent to it.
   */
  findPendingForAddress(
    input: FindPendingForAddressInput,
  ): Promise<PendingMinistryInvitationReference | null>;

  /**
   * Any status, scoped to Church, row-locked (`FOR UPDATE`) so a racing
   * acceptance, decline or resend sees one committed outcome. `null` when
   * missing or malformed.
   */
  lockMinistryInvitation(
    input: LockMinistryInvitationInput,
  ): Promise<MinistryInvitation | null>;

  /** The Church Invitation's stored status, row-locked; `null` when missing. */
  lockChurchInvitation(
    input: LockChurchInvitationInput,
  ): Promise<ChurchInvitationStatus | null>;

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
   * Public redemption lookup by Church Invitation, resolving its pending
   * paired Ministry Invitation, if any. All unavailable lifecycle states
   * deliberately collapse to null so transport never reveals why a link
   * cannot be used.
   */
  findPublicRedemptionPreview(
    input: FindPublicRedemptionPreviewInput,
  ): Promise<PublicRedemptionPreview | null>;

  /** Ids of the other still-pending, unexpired Ministry halves of one Church Invitation. */
  findPendingSiblingMinistryInvitationIds(
    input: FindPendingSiblingMinistryInvitationsInput,
  ): Promise<string[]>;

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

  /**
   * The stored-pending Church Invitation (member or admin, expired included)
   * for this address, row-locked so acceptance or an upgrade cannot race the
   * caller. Re-inviting must reuse it rather than mint a second one.
   */
  findPendingChurchInvitationByEmail(
    input: FindPendingChurchInvitationByEmailInput,
  ): Promise<ChurchInvitationSummary | null>;

  /**
   * Writes a Better Auth `invitation` row directly, the same way Church
   * Provisioning does. The pending Church/address index backstop surfaces as
   * `PendingChurchInvitationExistsError`.
   */
  createChurchInvitation(
    input: CreateChurchInvitationInput,
  ): Promise<ChurchInvitationSummary>;

  /** Raises a still-pending Church offer to admin in place; throws if it is no longer pending. */
  upgradeChurchInvitationToAdmin(
    input: UpgradeChurchInvitationToAdminInput,
  ): Promise<void>;

  /** The T1 producer's read: `null` once the offer is no longer pending. */
  findPendingChurchOffer(
    input: FindPendingChurchOfferInput,
  ): Promise<PendingChurchOffer | null>;

  create(input: CreateMinistryInvitationInput): Promise<MinistryInvitation>;

  /**
   * Reissues a pending Church Invitation's validity and aligns every
   * still-pending Ministry half on it. Access Levels, Roles and resend
   * throttle state are untouched. `false` when the Church Invitation is no
   * longer pending: nothing changed, and the caller must not commit a child
   * refresh on its own.
   */
  alignPairedExpiry(input: AlignPairedExpiryInput): Promise<boolean>;

  /**
   * Marks the still-unsent chained T1 outbox rows of a Church Invitation's
   * halves as failed (the outbox's terminal state), so an upgrade's one
   * current T1 is the only email. Rows are kept, never deleted.
   */
  supersedeUnsentChainedOutbox(
    input: SupersedeUnsentChainedOutboxInput,
  ): Promise<void>;

  /** Refreshes a still-pending invitation's `expiresAt` and resend-throttle bookkeeping in one write. */
  applyResend(input: ApplyResendInput): Promise<MinistryInvitation>;

  enqueueOutboxMessage(input: EnqueueOutboxMessageInput): Promise<void>;
}
