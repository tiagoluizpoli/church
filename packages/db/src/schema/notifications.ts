import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { church } from './church';

/**
 * A Church Member's private Notification history (ADR-0008), keyed by User
 * and Church rather than Volunteer. `data` freezes the display facts at first
 * delivery and carries only identifiers for deep links, so no foreign key
 * points at a scheduling object and deleting one never cascades into history.
 * `createdAt` is millisecond precision so the `(createdAt, id)` cursor
 * round-trips through a JS Date without losing equal-Instant siblings.
 */
export const notification = pgTable(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 64 }).notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    sourceOutboxId: uuid('source_outbox_id').notNull(),
    readAt: timestamp('read_at', {
      withTimezone: true,
      mode: 'date',
      precision: 3,
    }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
      precision: 3,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('notification_source_outbox_uidx').on(table.sourceOutboxId),
    index('notification_inbox_idx').on(
      table.userId,
      table.churchId,
      table.createdAt,
      table.id,
    ),
    index('notification_unread_idx').on(
      table.userId,
      table.churchId,
      table.readAt,
    ),
  ],
);
