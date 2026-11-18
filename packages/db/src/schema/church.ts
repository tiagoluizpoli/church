import { relations } from 'drizzle-orm';
import { jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { organization } from './organization';

// A Church *is* an `organization` row. Better Auth owns its identity — `name`
// and `slug` are writable there and nowhere else — and this table is the domain
// extension of that same row, carrying only what Better Auth has no column for.
// Sharing the primary key is what keeps every `church_id` foreign key across
// scheduling, participation and planning resolving unchanged.
export const church = pgTable('church', {
  id: uuid('id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  timezone: text('timezone').default('UTC').notNull(),
  settings: jsonb('settings').default({}),
});

// Declared on this side only: `organization.ts` is Better Auth's territory and
// importing `church` back into it would make the two modules circular.
export const churchRelations = relations(church, ({ one }) => ({
  organization: one(organization, {
    fields: [church.id],
    references: [organization.id],
  }),
}));
