import type { Instant } from '@church/time';
import type { ChurchId } from '../../branded-ids';
import type {
  NotificationDeliveryData,
  NotificationRequest,
} from '../../notification-kinds';
import type { ReplayableEmail } from './email-sender';
import type { TransactionContext } from './transaction-context';
import type { ChurchRecipient } from '@/domain/contracts/application/church-notifications';

export type OutboxMessageKind =
  | 'invitation.chained'
  | 'invitation.church-bootstrap'
  | 'redemption.accepted'
  | 'notification';

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
  /** Present once the email was prepared, before its first external attempt. */
  emailDelivery?: OutboxEmailDelivery;
}

/** A sink's outcome once it no longer needs an attempt. */
export type SettledChannelOutcome = 'delivered' | 'skipped' | 'failed';

/** Settled outcomes of a `notification` row, by sink name. */
export type ChannelOutcomes = Record<string, SettledChannelOutcome>;

/**
 * The email channel's durable delivery state for one row: the exact request
 * every attempt resends, the stable provider idempotency key, when the first
 * attempt began (bounding the provider's retention window) and, once the
 * provider confirmed it, the receipt Instant that suppresses a replay.
 */
export interface OutboxEmailDelivery {
  email: ReplayableEmail;
  idempotencyKey: string;
  firstAttemptAt: Instant;
  deliveredAt?: Instant;
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

/** One Notification to one recipient (ADR-0008), written by `notifications.enqueue`. */
export type NotificationOutboxPayload = NotificationRequest & {
  to: ChurchRecipient;
  /** Display facts frozen at the row's first resolution; retries reuse them. */
  facts?: NotificationDeliveryData;
};

export interface NotificationOutboxMessage extends OutboxMessageBase {
  kind: 'notification';
  payload: NotificationOutboxPayload;
  channelOutcomes: ChannelOutcomes;
}

export type OutboxMessage =
  | ChainedInvitationOutboxMessage
  | ChurchBootstrapOutboxMessage
  | RedemptionAcceptedOutboxMessage
  | NotificationOutboxMessage;

export interface ClaimPendingOutboxMessagesInput {
  limit: number;
  now: Date;
  tx: TransactionContext;
}

export interface MarkOutboxMessageSentInput {
  id: string;
  providerMessageId?: string;
  sentAt: Date;
  /** A `notification` row's settled sinks, persisted with its completion. */
  channelOutcomes?: ChannelOutcomes;
  tx: TransactionContext;
}

export interface MarkOutboxMessageFailedInput {
  id: string;
  lastError: string;
  attempts: number;
  /** `pending` to retry later (with `scheduledFor` bumped), `failed` when terminal. */
  status: OutboxMessageStatus;
  scheduledFor?: Date;
  /** Settled sinks survive the retry or terminal failure of another sink. */
  channelOutcomes?: ChannelOutcomes;
  tx: TransactionContext;
}

export interface RecordOutboxEmailPreparedInput {
  id: string;
  email: ReplayableEmail;
  idempotencyKey: string;
  firstAttemptAt: Instant;
  tx: TransactionContext;
}

export interface RecordOutboxEmailDeliveredInput {
  id: string;
  providerMessageId?: string;
  deliveredAt: Instant;
  tx: TransactionContext;
}

export interface RecordOutboxDeliveryFactsInput {
  id: string;
  facts: NotificationDeliveryData;
  tx: TransactionContext;
}

export interface EnqueueNotificationOutboxMessageInput {
  churchId: ChurchId;
  payload: NotificationOutboxPayload;
  correlationId: string;
  scheduledFor: Date;
  tx: TransactionContext;
}

export interface FindOutboxEmailDeliveryInput {
  id: string;
  tx?: TransactionContext;
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

  /** Persists the prepared email, key and first-attempt Instant — committed
   * before the provider is called, so a retry resends exactly this. */
  recordEmailPrepared(input: RecordOutboxEmailPreparedInput): Promise<void>;

  /** Freezes a `notification` row's resolved display facts into its payload. */
  recordDeliveryFacts(input: RecordOutboxDeliveryFactsInput): Promise<void>;

  /** Persists the provider's confirmed receipt for the email channel. */
  recordEmailDelivered(input: RecordOutboxEmailDeliveredInput): Promise<void>;

  /** Writes one `notification` row in the caller's transaction. */
  enqueueNotification(
    input: EnqueueNotificationOutboxMessageInput,
  ): Promise<void>;

  /** The email channel's persisted delivery state for a row, if prepared. */
  findEmailDelivery(
    input: FindOutboxEmailDeliveryInput,
  ): Promise<OutboxEmailDelivery | null>;

  /**
   * Reads the most recent outbox row's status for a Ministry Invitation.
   * There is no FK column — `payload` is jsonb — so this matches
   * structurally on the invitation id (top level for Transactional rows,
   * under `data` for `ministry_invitation` Notifications), scoped by Church. A
   * resend enqueues a second row for the same invitation, so "latest" is
   * ordered by `createdAt` descending; the minting API's response surfaces
   * this as the invitation's delivery status (spec #56 §6.4). Returns
   * `null` when no outbox row exists yet for that invitation.
   */
  findLatestStatusForMinistryInvitation(
    input: FindLatestOutboxStatusForMinistryInvitationInput,
  ): Promise<OutboxMessageStatus | null>;
}
