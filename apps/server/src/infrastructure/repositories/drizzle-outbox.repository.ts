import { outboxMessage } from '@church/db';
import { fromDate, toDate } from '@church/time';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { ChurchId } from '../../domain/branded-ids';
import type { PreparedEmail } from '../../domain/contracts/infrastructure/email-sender';
import type {
  ChainedInvitationOutboxMessage,
  ChurchBootstrapOutboxMessage,
  ClaimPendingOutboxMessagesInput,
  FindLatestOutboxStatusForMinistryInvitationInput,
  MarkOutboxMessageFailedInput,
  MarkOutboxMessageSentInput,
  MinistryInvitationOutboxMessage,
  OutboxEmailDelivery,
  OutboxMessage,
  OutboxMessageStatus,
  OutboxRepository,
  RecordOutboxEmailDeliveredInput,
  RecordOutboxEmailPreparedInput,
  RedemptionAcceptedOutboxMessage,
  TransferLeaderlessMinistryOutboxMessage,
  TransferMinistryDigestOutboxMessage,
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
    const client = getClient({ db: this.db, tx });
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
    await getClient({ db: this.db, tx })
      .update(outboxMessage)
      .set({ status: 'sent', providerMessageId, sentAt })
      .where(eq(outboxMessage.id, id));
  }

  async markFailed(input: MarkOutboxMessageFailedInput): Promise<void> {
    const { id, lastError, attempts, status, scheduledFor, tx } = input;
    await getClient({ db: this.db, tx })
      .update(outboxMessage)
      .set({ status, attempts, lastError, scheduledFor })
      .where(eq(outboxMessage.id, id));
  }

  async recordEmailPrepared(
    input: RecordOutboxEmailPreparedInput,
  ): Promise<void> {
    const { id, email, idempotencyKey, firstAttemptAt, tx } = input;
    await getClient({ db: this.db, tx })
      .update(outboxMessage)
      .set({
        emailRequest: email,
        emailIdempotencyKey: idempotencyKey,
        emailFirstAttemptAt: toDate({ instant: firstAttemptAt }),
      })
      .where(eq(outboxMessage.id, id));
  }

  async recordEmailDelivered(
    input: RecordOutboxEmailDeliveredInput,
  ): Promise<void> {
    const { id, providerMessageId, deliveredAt, tx } = input;
    await getClient({ db: this.db, tx })
      .update(outboxMessage)
      .set({
        providerMessageId,
        emailDeliveredAt: toDate({ instant: deliveredAt }),
      })
      .where(eq(outboxMessage.id, id));
  }

  async findLatestStatusForMinistryInvitation(
    input: FindLatestOutboxStatusForMinistryInvitationInput,
  ): Promise<OutboxMessageStatus | null> {
    const { churchId, ministryInvitationId, tx } = input;
    const [row] = await getClient({ db: this.db, tx })
      .select({ status: outboxMessage.status })
      .from(outboxMessage)
      .where(
        and(
          withChurchIsolation({ table: outboxMessage, churchId }),
          inArray(outboxMessage.kind, [
            'invitation.chained',
            'invitation.ministry',
          ]),
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
    emailDelivery: mapEmailDelivery(row),
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
    case 'redemption.accepted':
      return {
        ...base,
        kind: row.kind,
        payload: row.payload as RedemptionAcceptedOutboxMessage['payload'],
      };
    case 'transfer.ministry-digest':
      return {
        ...base,
        kind: row.kind,
        payload: row.payload as TransferMinistryDigestOutboxMessage['payload'],
      };
    case 'transfer.leaderless-ministry':
      return {
        ...base,
        kind: row.kind,
        payload:
          row.payload as TransferLeaderlessMinistryOutboxMessage['payload'],
      };
  }
}

/** `email_request` is jsonb written only by `recordEmailPrepared`, from a
 * JSON-safe `PreparedEmail`, so the read-back is that same shape. */
function mapEmailDelivery(
  row: OutboxMessageRow,
): OutboxEmailDelivery | undefined {
  const { emailRequest, emailIdempotencyKey, emailFirstAttemptAt } = row;
  if (!emailRequest || !emailIdempotencyKey || !emailFirstAttemptAt) {
    return undefined;
  }
  return {
    email: emailRequest as PreparedEmail,
    idempotencyKey: emailIdempotencyKey,
    firstAttemptAt: fromDate({ date: emailFirstAttemptAt }),
    deliveredAt: row.emailDeliveredAt
      ? fromDate({ date: row.emailDeliveredAt })
      : undefined,
  };
}
