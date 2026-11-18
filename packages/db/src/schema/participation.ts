import {
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { church } from './church';
import { ministry, volunteer } from './core';
import { participationStateEnum } from './enums';
import { cycle } from './planning';
import { event, eventTimeBlock } from './scheduling';

export const ministryParticipation = pgTable(
  'ministry_participation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    ministryId: uuid('ministry_id')
      .notNull()
      .references(() => ministry.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    state: participationStateEnum('state').default('preparing').notNull(),
    touchedAt: timestamp('touched_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('participation_ministry_event_idx').on(
      table.ministryId,
      table.eventId,
    ),
  ],
);

export const participationEventTimeBlockInclusion = pgTable(
  'participation_event_time_block_inclusion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    participationId: uuid('participation_id')
      .notNull()
      .references(() => ministryParticipation.id, { onDelete: 'cascade' }),
    eventTimeBlockId: uuid('event_time_block_id')
      .notNull()
      .references(() => eventTimeBlock.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('participation_event_time_block_inclusion_idx').on(
      table.participationId,
      table.eventTimeBlockId,
    ),
  ],
);

/** Last Assignment facts communicated to a Volunteer for a Ministry's Cycle. */
export const scheduleLastTold = pgTable(
  'schedule_last_told',
  {
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    ministryId: uuid('ministry_id')
      .notNull()
      .references(() => ministry.id, { onDelete: 'cascade' }),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => cycle.id, { onDelete: 'cascade' }),
    volunteerId: uuid('volunteer_id')
      .notNull()
      .references(() => volunteer.id, { onDelete: 'cascade' }),
    assignments: jsonb('assignments').notNull(),
    // When this baseline was last saved: a cover closed after it is news to the next send.
    toldAt: timestamp('told_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('schedule_last_told_scope_idx').on(
      table.churchId,
      table.ministryId,
      table.cycleId,
      table.volunteerId,
    ),
  ],
);
