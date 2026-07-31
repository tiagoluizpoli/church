import type { ChurchId } from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

export type OutboxMessageKind =
  | 'invitation.chained'
  | 'invitation.ministry'
  | 'invitation.church-bootstrap'
  | 'transfer.ministry-digest'
  | 'transfer.leaderless-ministry';

export type OutboxMessageStatus = 'pending' | 'sent' | 'failed';

export interface OutboxMessage {
  id: string;
  churchId: ChurchId;
  kind: OutboxMessageKind;
  payload: Record<string, unknown>;
  status: OutboxMessageStatus;
  attempts: number;
  scheduledFor: Date;
  lastError?: string;
  providerMessageId?: string;
  correlationId: string;
  sentAt?: Date;
}

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
   * Claims up to `limit` due, pending rows via `FOR UPDATE SKIP LOCKED`, so
   * concurrent workers never claim the same row twice. Callers process and
   * mark each row within the same transaction the claim was made in — the
   * lock is held for the row's entire send attempt, which is the simplest
   * design the current `pending | sent | failed` status set supports without
   * adding a `processing` status.
   */
  claimPending(
    input: ClaimPendingOutboxMessagesInput,
  ): Promise<OutboxMessage[]>;

  markSent(input: MarkOutboxMessageSentInput): Promise<void>;

  markFailed(input: MarkOutboxMessageFailedInput): Promise<void>;
}
