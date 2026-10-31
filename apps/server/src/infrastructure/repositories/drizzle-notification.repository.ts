import { notification } from '@church/db';
import { nowAsDate } from '@church/time';
import { and, count, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type {
  CountUnreadNotificationsInput,
  CreateNotificationInput,
  ListNotificationsInput,
  MarkAllNotificationsReadInput,
  MarkNotificationReadInput,
  NotificationRepository,
} from '../../domain/contracts/infrastructure/notification.repository';
import type {
  NotificationOwner,
  NotificationPage,
} from '../../domain/entities/notification';
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
} from '../../domain/notification-cursor';
import { mapNotification } from '../mappers/notification.mapper';
import { getClient } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleNotificationRepositoryInput {
  db: AnyDrizzleDb;
}

function ownedBy({ userId, churchId }: NotificationOwner) {
  return and(
    eq(notification.userId, userId),
    eq(notification.churchId, churchId),
  );
}

export class DrizzleNotificationRepository implements NotificationRepository {
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzleNotificationRepositoryInput) {
    this.db = db;
  }

  async create({
    userId,
    churchId,
    payload,
    sourceOutboxId,
    createdAt,
    tx,
  }: CreateNotificationInput) {
    const client = getClient({ db: this.db, tx });
    const [inserted] = await client
      .insert(notification)
      .values({
        userId,
        churchId,
        kind: payload.kind,
        data: payload.data,
        sourceOutboxId,
        createdAt,
      })
      .onConflictDoNothing({ target: notification.sourceOutboxId })
      .returning();
    const row =
      inserted ??
      (
        await client
          .select()
          .from(notification)
          .where(eq(notification.sourceOutboxId, sourceOutboxId))
      )[0];
    if (!row) throw new Error('Notification insert failed');
    return mapNotification(row);
  }

  async list({
    userId,
    churchId,
    cursor,
    limit,
    tx,
  }: ListNotificationsInput): Promise<NotificationPage> {
    const position = cursor ? decodeNotificationCursor({ cursor }) : undefined;
    if (cursor && !position) throw new Error('Invalid Notification cursor');

    const rows = await getClient({ db: this.db, tx })
      .select()
      .from(notification)
      .where(
        and(
          ownedBy({ userId, churchId }),
          position
            ? or(
                lt(notification.createdAt, position.createdAt),
                and(
                  eq(notification.createdAt, position.createdAt),
                  sql`${notification.id} < ${position.id}`,
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(notification.createdAt), desc(notification.id))
      .limit(limit + 1);

    const items = rows.slice(0, limit).map(mapNotification);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeNotificationCursor({
              createdAt: last.createdAt,
              id: last.id,
            })
          : undefined,
    };
  }

  async countUnread({
    userId,
    churchId,
    tx,
  }: CountUnreadNotificationsInput): Promise<number> {
    const [row] = await getClient({ db: this.db, tx })
      .select({ count: count() })
      .from(notification)
      .where(and(ownedBy({ userId, churchId }), isNull(notification.readAt)));
    return row?.count ?? 0;
  }

  async markRead({
    userId,
    churchId,
    notificationId,
    tx,
  }: MarkNotificationReadInput): Promise<boolean> {
    const [row] = await getClient({ db: this.db, tx })
      .update(notification)
      .set({ readAt: sql`coalesce(${notification.readAt}, ${nowAsDate()})` })
      .where(
        and(eq(notification.id, notificationId), ownedBy({ userId, churchId })),
      )
      .returning({ id: notification.id });
    return row !== undefined;
  }

  async markAllRead({
    userId,
    churchId,
    tx,
  }: MarkAllNotificationsReadInput): Promise<number> {
    const result = await getClient({ db: this.db, tx })
      .update(notification)
      .set({ readAt: nowAsDate() })
      .where(and(ownedBy({ userId, churchId }), isNull(notification.readAt)));
    return result.rowCount ?? 0;
  }
}
