import type { ChurchId } from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

export type OutboxMessageKind =
  | 'invitation.chained'
  | 'invitation.ministry'
  | 'invitation.church-bootstrap'
  | 'redemption.accepted'
  | 'transfer.ministry-digest'
  | 'transfer.leaderless-ministry';

export const OUTBOX_MESSAGE_STATUS_OPTIONS = [
  'pending',
  'processing',
  'sent',
  'failed',
] as const;
export type OutboxMessageStatus =
  (typeof OUTBOX_MESSAGE_STATUS_OPTIONS)[number];

interface OutboxMessageBase {
  id: string;
  churchId: ChurchId;
  status: OutboxMessageStatus;
  attempts: number;
  scheduledFor: Date;
  lastError?: string;
  providerMessageId?: string;
  correlationId: string;
  sentAt?: Date;
}

export interface ChainedInvitationOutboxPayload {
  ministryInvitationId: string;
  churchInvitationId: string;
}

/** Mirrors the payload `mintChained` enqueues (db-ministry-invitation-manager.ts). */
export interface ChainedInvitationOutboxMessage extends OutboxMessageBase {
  kind: 'invitation.chained';
  payload: ChainedInvitationOutboxPayload;
}

export interface MinistryInvitationOutboxPayload {
  ministryInvitationId: string;
}

/** Mirrors the payload `mintForExistingMember`/`resend` enqueue. */
export interface MinistryInvitationOutboxMessage extends OutboxMessageBase {
  kind: 'invitation.ministry';
  payload: MinistryInvitationOutboxPayload;
}

export interface ChurchBootstrapOutboxPayload {
  churchInvitationId: string;
}

/** Not enqueued anywhere yet (issue #62) — shape follows spec §6.2's bootstrap bullet. */
export interface ChurchBootstrapOutboxMessage extends OutboxMessageBase {
  kind: 'invitation.church-bootstrap';
  payload: ChurchBootstrapOutboxPayload;
}

/** Confirmation sent once a Ministry Invitation has been redeemed. */
export interface RedemptionAcceptedOutboxPayload {
  ministryInvitationId: string;
  volunteerId: string;
}

export interface RedemptionAcceptedOutboxMessage extends OutboxMessageBase {
  kind: 'redemption.accepted';
  payload: RedemptionAcceptedOutboxPayload;
}

/**
 * One row per affected Ministry (spec §8.8): `volunteerId` is the *retired*
 * source Volunteer profile — it still exists (never deleted), so the
 * departing Volunteer's display name is reachable at send time. The
 * withdrawn-assignment list is not duplicated here; it is re-derived at send
 * time from `assignment_audit` by `correlationId` (the outbox row's own
 * column) scoped to this `ministryId`, matching the "payload carries ids,
 * rendered at send time" rule the other kinds already follow. Both transfer
 * notification kinds carry this same shape — only the addressee resolution
 * (active leaders vs. ChurchAdmins) differs at send time.
 */
export interface TransferOutboxPayload {
  ministryId: string;
  volunteerId: string;
}

export type TransferMinistryDigestOutboxPayload = TransferOutboxPayload;

/** Addressed to the Ministry's active leaders — the routine case. */
export interface TransferMinistryDigestOutboxMessage extends OutboxMessageBase {
  kind: 'transfer.ministry-digest';
  payload: TransferMinistryDigestOutboxPayload;
}

export type TransferLeaderlessMinistryOutboxPayload = TransferOutboxPayload;

/** Escalated to every ChurchAdmin — the departure left the Ministry with no active leader. */
export interface TransferLeaderlessMinistryOutboxMessage
  extends OutboxMessageBase {
  kind: 'transfer.leaderless-ministry';
  payload: TransferLeaderlessMinistryOutboxPayload;
}

export type OutboxMessage =
  | ChainedInvitationOutboxMessage
  | MinistryInvitationOutboxMessage
  | ChurchBootstrapOutboxMessage
  | RedemptionAcceptedOutboxMessage
  | TransferMinistryDigestOutboxMessage
  | TransferLeaderlessMinistryOutboxMessage;

export interface ClaimPendingOutboxMessagesInput {
  limit: number;
  now: Date;
  tx: TransactionContext;
}

export interface MarkOutboxMessageSentInput {
  id: string;
  providerMessageId?: string;
  sentAt: Date;
  tx: TransactionContext;
}

export interface MarkOutboxMessageFailedInput {
  id: string;
  lastError: string;
  attempts: number;
  /** `pending` to retry later (with `scheduledFor` bumped), `failed` when terminal. */
  status: OutboxMessageStatus;
  scheduledFor?: Date;
  tx: TransactionContext;
}

export interface FindLatestOutboxStatusForMinistryInvitationInput {
  churchId: ChurchId;
  ministryInvitationId: string;
  tx?: TransactionContext;
}

export interface OutboxRepository {
  /**
   * Claims up to `limit` due, pending rows via `FOR UPDATE SKIP LOCKED` and
   * transitions them to `processing`, all within the caller's transaction —
   * which the caller commits immediately after this call returns. The actual
   * send happens outside any open transaction (so a slow or hung EmailSender
   * call never holds a database connection), then `markSent`/`markFailed`
   * runs in a second, separate transaction. Concurrent workers never claim
   * the same row twice because the lock is held for the claim+transition
   * step, not the whole send attempt.
   */
  claimPending(
    input: ClaimPendingOutboxMessagesInput,
  ): Promise<OutboxMessage[]>;

  markSent(input: MarkOutboxMessageSentInput): Promise<void>;

  markFailed(input: MarkOutboxMessageFailedInput): Promise<void>;

  /**
   * Reads the most recent outbox row's status for a Ministry Invitation.
   * There is no FK column — `payload` is jsonb — so this matches
   * structurally on `payload->>'ministryInvitationId'`, scoped by Church. A
   * resend enqueues a second row for the same invitation, so "latest" is
   * ordered by `createdAt` descending; the minting API's response surfaces
   * this as the invitation's delivery status (spec #56 §6.4). Returns
   * `null` when no outbox row exists yet for that invitation.
   */
  findLatestStatusForMinistryInvitation(
    input: FindLatestOutboxStatusForMinistryInvitationInput,
  ): Promise<OutboxMessageStatus | null>;
}
