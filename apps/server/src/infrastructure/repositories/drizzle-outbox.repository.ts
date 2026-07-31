import { outboxMessage } from '@church/db';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { ChurchId } from '../../domain/branded-ids';
import type {
  ChainedInvitationOutboxMessage,
  ChurchBootstrapOutboxMessage,
  ClaimPendingOutboxMessagesInput,
  FindLatestOutboxStatusForMinistryInvitationInput,
  MarkOutboxMessageFailedInput,
  MarkOutboxMessageSentInput,
  MinistryInvitationOutboxMessage,
  OutboxMessage,
  OutboxMessageStatus,
  OutboxRepository,
  TransferOutboxMessage,
} from '../../domain/contracts/infrastructure/outbox.repository';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleOutboxRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleOutboxRepository implements OutboxRepository {
  constructor({ db }: DrizzleOutboxRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async claimPending(
    input: ClaimPendingOutboxMessagesInput,
  ): Promise<OutboxMessage[]> {
    const { limit, now, tx } = input;
    const client = getClient(this.db, tx);
    const claimable = await client
      .select({ id: outboxMessage.id })
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
    if (claimable.length === 0) return [];

    const claimedIds = claimable.map((row) => row.id);
    const rows = await client
      .update(outboxMessage)
      .set({ status: 'processing' })
      .where(inArray(outboxMessage.id, claimedIds))
      .returning();
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

  async findLatestStatusForMinistryInvitation(
    input: FindLatestOutboxStatusForMinistryInvitationInput,
  ): Promise<OutboxMessageStatus | null> {
    const { churchId, ministryInvitationId, tx } = input;
    const [row] = await getClient(this.db, tx)
      .select({ status: outboxMessage.status })
      .from(outboxMessage)
      .where(
        and(
          withChurchIsolation(outboxMessage, churchId),
          sql`${outboxMessage.payload} ->> 'ministryInvitationId' = ${ministryInvitationId}`,
        ),
      )
      .orderBy(desc(outboxMessage.createdAt))
      .limit(1);
    return row?.status ?? null;
  }
}

type OutboxMessageRow = typeof outboxMessage.$inferSelect;

/**
 * `payload` is jsonb — its shape is only as trustworthy as whatever enqueued
 * it. Branching on `kind` narrows the return type to one exact member of the
 * union, so the only cast left is `payload`, one kind at a time, rather than
 * a single cast over the whole object.
 */
function mapOutboxMessage(row: OutboxMessageRow): OutboxMessage {
  const base = {
    id: row.id,
    churchId: row.churchId as ChurchId,
    status: row.status,
    attempts: row.attempts,
    scheduledFor: row.scheduledFor,
    lastError: row.lastError ?? undefined,
    providerMessageId: row.providerMessageId ?? undefined,
    correlationId: row.correlationId,
    sentAt: row.sentAt ?? undefined,
  };

  switch (row.kind) {
    case 'invitation.chained':
      return {
        ...base,
        kind: row.kind,
        payload: row.payload as ChainedInvitationOutboxMessage['payload'],
      };
    case 'invitation.ministry':
      return {
        ...base,
        kind: row.kind,
        payload: row.payload as MinistryInvitationOutboxMessage['payload'],
      };
    case 'invitation.church-bootstrap':
      return {
        ...base,
        kind: row.kind,
        payload: row.payload as ChurchBootstrapOutboxMessage['payload'],
      };
    case 'transfer.ministry-digest':
    case 'transfer.leaderless-ministry':
      return {
        ...base,
        kind: row.kind,
        payload: row.payload as TransferOutboxMessage['payload'],
      };
  }
}
