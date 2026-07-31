import { outboxMessage } from '@church/db';
import { and, asc, eq, lte } from 'drizzle-orm';
import type { ChurchId } from '../../domain/branded-ids';
import type {
  ClaimPendingOutboxMessagesInput,
  MarkOutboxMessageFailedInput,
  MarkOutboxMessageSentInput,
  OutboxMessage,
  OutboxRepository,
} from '../../domain/contracts/infrastructure/outbox.repository';
import { getClient } from './helpers';
import type { AnyDrizzleDb } from './types';

export class DrizzleOutboxRepository implements OutboxRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

  async claimPending(
    input: ClaimPendingOutboxMessagesInput,
  ): Promise<OutboxMessage[]> {
    const { limit, now, tx } = input;
    const rows = await getClient(this.db, tx)
      .select()
      .from(outboxMessage)
      .where(
        and(
          eq(outboxMessage.status, 'pending'),
          lte(outboxMessage.scheduledFor, now),
        ),
      )
      .orderBy(asc(outboxMessage.scheduledFor))
      .limit(limit)
      .for('update', { skipLocked: true });
    return rows.map(mapOutboxMessage);
  }

  async markSent(input: MarkOutboxMessageSentInput): Promise<void> {
    const { id, providerMessageId, sentAt, tx } = input;
    await getClient(this.db, tx)
      .update(outboxMessage)
      .set({ status: 'sent', providerMessageId, sentAt })
      .where(eq(outboxMessage.id, id));
  }

  async markFailed(input: MarkOutboxMessageFailedInput): Promise<void> {
    const { id, lastError, attempts, status, scheduledFor, tx } = input;
    await getClient(this.db, tx)
      .update(outboxMessage)
      .set({ status, attempts, lastError, scheduledFor })
      .where(eq(outboxMessage.id, id));
  }
}

type OutboxMessageRow = typeof outboxMessage.$inferSelect;

/**
 * `payload` is jsonb — its shape is only as trustworthy as whatever enqueued
 * it. This cast is the one place that trust boundary is crossed; everywhere
 * else sees the discriminated `OutboxMessage` union.
 */
function mapOutboxMessage(row: OutboxMessageRow): OutboxMessage {
  return {
    id: row.id,
    churchId: row.churchId as ChurchId,
    kind: row.kind,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    scheduledFor: row.scheduledFor,
    lastError: row.lastError ?? undefined,
    providerMessageId: row.providerMessageId ?? undefined,
    correlationId: row.correlationId,
    sentAt: row.sentAt ?? undefined,
  } as OutboxMessage;
}
