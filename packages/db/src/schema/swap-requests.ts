import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { assignment } from './assignments';
import { user } from './auth';
import { church } from './church';

export const swapRequest = pgTable(
  'swap_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignment.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    note: text('note'),
    reply: text('reply'),
    raisedBy: text('raised_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    raisedAt: timestamp('raised_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    closedBy: text('closed_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    // One open request per Assignment.
    uniqueIndex('swap_request_open_assignment_idx')
      .on(table.assignmentId)
      .where(sql`${table.status} = 'open'`),
    index('swap_request_assignment_idx').on(table.assignmentId),
    check(
      'swap_request_status_check',
      sql`${table.status} IN ('open', 'covered', 'kept', 'withdrawn', 'expired')`,
    ),
  ],
);
