import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { assignment } from './assignments';
import { church } from './church';
import { ministry, volunteer } from './core';
import { volunteerNotificationTypeEnum } from './enums';
import { event } from './scheduling';

export const volunteerNotification = pgTable(
  'volunteer_notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    volunteerId: uuid('volunteer_id')
      .notNull()
      .references(() => volunteer.id, { onDelete: 'cascade' }),
    ministryId: uuid('ministry_id').references(() => ministry.id, {
      onDelete: 'set null',
    }),
    eventId: uuid('event_id').references(() => event.id, {
      onDelete: 'set null',
    }),
    assignmentId: uuid('assignment_id').references(() => assignment.id, {
      onDelete: 'set null',
    }),
    type: volunteerNotificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),
    payload: jsonb('payload').$type<Record<string, string | null>>().notNull(),
    readAt: timestamp('read_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('volunteer_notification_inbox_idx').on(
      table.churchId,
      table.volunteerId,
      table.createdAt,
    ),
    index('volunteer_notification_unread_idx').on(
      table.churchId,
      table.volunteerId,
      table.readAt,
    ),
  ],
);
