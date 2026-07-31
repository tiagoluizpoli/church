import type { ChurchId } from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

export type OutboxMessageKind =
  | 'invitation.chained'
  | 'invitation.ministry'
  | 'invitation.church-bootstrap'
  | 'transfer.ministry-digest'
  | 'transfer.leaderless-ministry';

export type OutboxMessageStatus = 'pending' | 'processing' | 'sent' | 'failed';

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

/** Mirrors the payload `mintChained` enqueues (db-ministry-invitation-manager.ts). */
export interface ChainedInvitationOutboxMessage extends OutboxMessageBase {
  kind: 'invitation.chained';
  payload: { ministryInvitationId: string; churchInvitationId: string };
}

/** Mirrors the payload `mintForExistingMember`/`resend` enqueue. */
export interface MinistryInvitationOutboxMessage extends OutboxMessageBase {
  kind: 'invitation.ministry';
  payload: { ministryInvitationId: string };
}

/** Not enqueued anywhere yet (issue #62) — shape follows spec §6.2's bootstrap bullet. */
export interface ChurchBootstrapOutboxMessage extends OutboxMessageBase {
  kind: 'invitation.church-bootstrap';
  payload: { churchInvitationId: string };
}

/** Volunteer Transfer notifications — payload shape not designed yet (issue #60). */
export interface TransferOutboxMessage extends OutboxMessageBase {
  kind: 'transfer.ministry-digest' | 'transfer.leaderless-ministry';
  payload: Record<string, unknown>;
}

export type OutboxMessage =
  | ChainedInvitationOutboxMessage
  | MinistryInvitationOutboxMessage
  | ChurchBootstrapOutboxMessage
  | TransferOutboxMessage;

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
}
