import { randomUUID } from 'node:crypto';
import { notification } from '@church/db';
import { type Instant, toDate } from '@church/time';
import type { NotificationPayload } from '../../src/domain/notification-kinds';
import type { SeedWriter } from '../recipe';
import { requireInsertedRow } from './require-inserted-row';

export type SeededNotification = typeof notification.$inferSelect;

export interface BuildNotificationInput {
  db: SeedWriter;
  userId: string;
  churchId: string;
  /** Explicit, so a graph never depends on the wall clock at load time. */
  createdAt: Instant;
  payload: NotificationPayload;
  id?: string;
  /** Defaults to a fresh id; pass one to model a replay of the same outbox row. */
  sourceOutboxId?: string;
  /** When the member opened it; absent leaves it unread. */
  readAt?: Instant;
}

/** Direct state by purpose (ADR 0006): a member's inbox Notification as the inbox sink leaves it; unread unless `readAt` is given. */
export async function buildNotification({
  db,
  userId,
  churchId,
  createdAt,
  payload,
  id,
  sourceOutboxId,
  readAt,
}: BuildNotificationInput): Promise<SeededNotification> {
  return requireInsertedRow({
    rows: await db
      .insert(notification)
      .values({
        id,
        userId,
        churchId,
        kind: payload.kind,
        data: payload.data,
        sourceOutboxId: sourceOutboxId ?? randomUUID(),
        createdAt: toDate({ instant: createdAt }),
        readAt: readAt === undefined ? undefined : toDate({ instant: readAt }),
      })
      .returning(),
    description: `Notification of ${userId} in ${churchId}`,
  });
}
