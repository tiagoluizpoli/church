import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { church } from './church';
import { ministry, team } from './core';

export const ministryInvitation = pgTable('ministry_invitation', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id')
    .notNull()
    .references(() => church.id, { onDelete: 'cascade' }),
  ministryId: uuid('ministry_id')
    .notNull()
    .references(() => ministry.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id').references(() => team.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  type: varchar('type', { length: 50 }).notNull(), // one-time, multi-use
  status: varchar('status', { length: 50 }).default('active').notNull(), // active, used, expired
  expiresAt: timestamp('expires_at').notNull(),
});
