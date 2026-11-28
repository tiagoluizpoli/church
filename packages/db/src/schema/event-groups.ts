import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { church } from './church';
import { ministry } from './core';
import { eventTemplate } from './planning';

/**
 * A named Event group of a Ministry's export, in the leader's order. The
 * catch-all is never a row: it is every Event no group's template claims,
 * and its custom name sits on the Ministry.
 */
export const eventGroup = pgTable(
  'event_group',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    ministryId: uuid('ministry_id')
      .notNull()
      .references(() => ministry.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('event_group_ministry_position_idx').on(
      table.ministryId,
      table.position,
    ),
  ],
);

/**
 * An EventTemplate in one of a Ministry's Event groups, at most once per
 * Ministry. Deleting the template drops the link, so its Events fall into
 * the catch-all, older Cycles included.
 */
export const eventGroupTemplate = pgTable(
  'event_group_template',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    ministryId: uuid('ministry_id')
      .notNull()
      .references(() => ministry.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => eventGroup.id, { onDelete: 'cascade' }),
    eventTemplateId: uuid('event_template_id')
      .notNull()
      .references(() => eventTemplate.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (table) => [
    uniqueIndex('event_group_template_ministry_template_idx').on(
      table.ministryId,
      table.eventTemplateId,
    ),
    index('event_group_template_group_idx').on(table.groupId),
    index('event_group_template_template_idx').on(table.eventTemplateId),
  ],
);
