import { pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { church } from './church';
import { ministryMembership } from './core';
import { availabilityCheckStateEnum } from './enums';
import { cycle } from './planning';

export const availabilityCheck = pgTable(
  'availability_check',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => cycle.id, { onDelete: 'cascade' }),
    ministryMembershipId: uuid('ministry_membership_id')
      .notNull()
      .references(() => ministryMembership.id, { onDelete: 'cascade' }),
    state: availabilityCheckStateEnum('state').default('pending').notNull(),
    confirmedAt: timestamp('confirmed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('availability_check_cycle_membership_idx').on(
      table.cycleId,
      table.ministryMembershipId,
    ),
  ],
);
