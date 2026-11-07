import {
  date,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { church } from './church';
import { ministry, ministryMembership } from './core';
import { availabilityCheckStateEnum } from './enums';
import { cycle } from './planning';

/** One Ask per Schedule: a Schedule is one Ministry's part of one Cycle. */
export const availabilityAsk = pgTable(
  'availability_ask',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    ministryId: uuid('ministry_id')
      .notNull()
      .references(() => ministry.id, { onDelete: 'cascade' }),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => cycle.id, { onDelete: 'cascade' }),
    askedAt: timestamp('asked_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    /** The Deadline, a CalendarDay in the Church Timezone; display-only. */
    answerBy: date('answer_by', { mode: 'string' }),
    lastRemindedAt: timestamp('last_reminded_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => [
    uniqueIndex('availability_ask_church_ministry_cycle_idx').on(
      table.churchId,
      table.ministryId,
      table.cycleId,
    ),
  ],
);

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
    /**
     * Set when the Ministry Membership ended while the check was still
     * actionable: lifecycle metadata, not an answer state, so `state` and
     * answers stay as history and the check never accepts a write again.
     */
    withdrawnAt: timestamp('withdrawn_at', {
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
