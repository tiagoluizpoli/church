import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organization } from './organization';

// A Church *is* an `organization` row. Its `name` and `slug` live there (written
// through the app's Church Settings endpoints; Better Auth's update route is
// closed), and this table is the domain extension of that same row, carrying
// only what Better Auth has no column for.
// Sharing the primary key is what keeps every `church_id` foreign key across
// scheduling, participation and planning resolving unchanged.
export const church = pgTable('church', {
  id: uuid('id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  timezone: text('timezone').default('UTC').notNull(),
  settings: jsonb('settings').default({}),
  website: text('website'),
  accentColor: text('accent_color'),
});

// Declared on this side only: `organization.ts` is Better Auth's territory and
// importing `church` back into it would make the two modules circular.
export const churchRelations = relations(church, ({ one }) => ({
  organization: one(organization, {
    fields: [church.id],
    references: [organization.id],
  }),
}));

// Every Church Slug a Church gave up stays reserved to it forever. `slug` is
// unique across Churches; a live slug (organization.slug) is kept disjoint
// from this table by the slug-change write, which is the only writer.
export const churchSlugHistory = pgTable(
  'church_slug_history',
  {
    slug: text('slug').primaryKey(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('church_slug_history_church_id_idx').on(table.churchId)],
);
