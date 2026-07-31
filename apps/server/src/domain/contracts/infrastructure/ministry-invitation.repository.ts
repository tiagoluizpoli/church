import type { ChurchId, MinistryId, RoleId, UserId } from '../../branded-ids';
import type { MinistryInvitation } from '../../entities/ministry-invitation';
import type { MinistryAccessLevel } from '../../entities/ministry-volunteer';
import type { TransactionContext } from './transaction-context';

export interface AcquireMintLockInput {
  ministryId: MinistryId;
  email: string;
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

  enqueueOutboxMessage(input: EnqueueOutboxMessageInput): Promise<void>;
}
