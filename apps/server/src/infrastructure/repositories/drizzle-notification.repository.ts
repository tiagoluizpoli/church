import { event, eventTimeBlock, notification } from '@church/db';
import { nowAsDate } from '@church/time';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type {
  CountUnreadNotificationsInput,
  CreateNotificationInput,
  ListNotificationsInput,
  MarkAllNotificationsReadInput,
  MarkNotificationReadInput,
  NotificationRepository,
} from '../../domain/contracts/infrastructure/notification.repository';
import type {
  Notification,
  NotificationOwner,
  NotificationPage,
} from '../../domain/entities/notification';
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
} from '../../domain/notification-cursor';
import { schedulePublishedNotificationDataSchema } from '../../domain/notification-kinds';
import {
  noticeScope,
  wordedForHiddenChoice,
} from '../../domain/services/notifications/hidden-notice';
import { mapNotification } from '../mappers/notification.mapper';
import type { AnyDrizzleDb } from './drizzle-db.types';
import type {
  DrizzleNotificationRepositoryInput,
  WithHiddenChoiceInput,
} from './drizzle-notification.repository.types';
import { getClient } from './helpers';

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
      // list-order: one notification per source outbox message (unique)
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

    const pageRows = rows.slice(0, limit);
    const items = pageRows.flatMap((row) => {
      if (
        row.kind === 'schedule_published' &&
        !schedulePublishedNotificationDataSchema.safeParse(row.data).success
      ) {
        console.warn(
          `[Notification] skipping legacy schedule_published inbox row ${row.id}: missing frozen Schedule facts`,
        );
        return [];
      }
      return [mapNotification(row)];
    });
    const last = pageRows.at(-1);
    return {
      items: await this.withHiddenChoice({ churchId, items, tx }),
      nextCursor:
        rows.length > limit && last
          ? encodeNotificationCursor({
              createdAt: last.createdAt,
              id: last.id,
            })
          : undefined,
    };
  }

  /**
   * Every reader of stored notices comes through `list`, so a hidden Event's
   * title is dropped here, from the choice as it stands now.
   */
  private async withHiddenChoice({
    churchId,
    items,
    tx,
  }: WithHiddenChoiceInput): Promise<Notification[]> {
    const scopes = items.flatMap((item) => {
      const scope = noticeScope({ notification: item });
      return scope ? [scope] : [];
    });
    if (scopes.length === 0) return items;
    const client = getClient({ db: this.db, tx });
    const eventIds = scopes.map(({ eventId }) => eventId);
    const blockIds = scopes.flatMap(({ eventTimeBlockId }) =>
      eventTimeBlockId ? [eventTimeBlockId] : [],
    );
    const [events, blocks] = await Promise.all([
      // list-order: hidden event ids, checked by membership; order unused
      client
        .select({ id: event.id })
        .from(event)
        .where(
          and(
            eq(event.churchId, churchId),
            eq(event.isHidden, true),
            inArray(event.id, eventIds),
          ),
        ),
      // list-order: hidden block ids, checked by membership; order unused
      client
        .select({ id: eventTimeBlock.id })
        .from(eventTimeBlock)
        .where(
          and(
            eq(eventTimeBlock.churchId, churchId),
            eq(eventTimeBlock.isHidden, true),
            inArray(eventTimeBlock.id, blockIds),
          ),
        ),
    ]);
    const hidden = {
      eventIds: events.map(({ id }) => id),
      eventTimeBlockIds: blocks.map(({ id }) => id),
    };
    return items.map((item) =>
      wordedForHiddenChoice({ notification: item, hidden }),
    );
  }

  async countUnread({
    userId,
    churchId,
    tx,
  }: CountUnreadNotificationsInput): Promise<number> {
    const [row] = await getClient({ db: this.db, tx })
      .select({ count: count() })
      .from(notification)
      .where(
        and(
          ownedBy({ userId, churchId }),
          isNull(notification.readAt),
          sql`(${notification.kind} <> 'schedule_published' OR ${notification.data} ? 'cycleName')`,
        ),
      );
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
      .where(
        and(
          ownedBy({ userId, churchId }),
          isNull(notification.readAt),
          sql`(${notification.kind} <> 'schedule_published' OR ${notification.data} ? 'cycleName')`,
        ),
      );
    return result.rowCount ?? 0;
  }
}
