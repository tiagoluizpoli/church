import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { church, churchAddress } from './church';
import { role, sector } from './core';
import { eventStatusEnum, eventTimeBlockStatusEnum } from './enums';
import { ministryParticipation } from './participation';
import { cycle, eventTemplate, templateTimeBlock } from './planning';

export const event = pgTable(
  'event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => cycle.id, { onDelete: 'cascade' }),
    sourceTemplateId: uuid('source_template_id').references(
      () => eventTemplate.id,
      { onDelete: 'set null' },
    ),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    location: varchar('location', { length: 255 }),
    start: timestamp('start', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    end: timestamp('end', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    status: eventStatusEnum('status').default('draft').notNull(),
    // Qualifies a cancelled Event: out of sight for all but ChurchAdmins.
    isHidden: boolean('is_hidden').default(false).notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('event_church_cycle_idx').on(table.churchId, table.cycleId),
    check('event_date_check', sql`${table.start} < ${table.end}`),
  ],
);

export const eventTimeBlock = pgTable(
  'event_time_block',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    sourceTemplateTimeBlockId: uuid('source_template_time_block_id').references(
      () => templateTimeBlock.id,
      { onDelete: 'set null' },
    ),
    startTime: timestamp('start_time', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    endTime: timestamp('end_time', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    label: varchar('label', { length: 255 }),
    // Copied from the source TemplateTimeBlock on apply; independent afterwards.
    isPublic: boolean('is_public').default(false).notNull(),
    place: varchar('place', { length: 120 }),
    // A Church Address as the place instead of free text; resolved when read.
    placeAddressId: uuid('place_address_id').references(
      () => churchAddress.id,
      {
        onDelete: 'set null',
      },
    ),
    // Cancelling one block; its Shifts are cancelled through it (no Shift status).
    status: eventTimeBlockStatusEnum('status').default('active').notNull(),
    // The block's own choice; its Event's hides it too (isEventTimeBlockHidden).
    isHidden: boolean('is_hidden').default(false).notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('event_time_block_event_idx').on(table.eventId),
    check(
      'event_time_block_place_check',
      sql`${table.place} IS NULL OR ${table.placeAddressId} IS NULL`,
    ),
    check(
      'event_time_block_duration_check',
      sql`${table.startTime} < ${table.endTime}`,
    ),
  ],
);

/**
 * Append-only: one row per EventTimeBlock move made after its Cycle was sent,
 * written in the move's transaction. The first row's previous bounds are the
 * as-sent time.
 */
export const eventTimeBlockMove = pgTable(
  'event_time_block_move',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    eventTimeBlockId: uuid('event_time_block_id')
      .notNull()
      .references(() => eventTimeBlock.id, { onDelete: 'cascade' }),
    previousStart: timestamp('previous_start', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    previousEnd: timestamp('previous_end', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    newStart: timestamp('new_start', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    newEnd: timestamp('new_end', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    movedAt: timestamp('moved_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('event_time_block_move_block_idx').on(
      table.eventTimeBlockId,
      table.movedAt,
    ),
  ],
);

export const shift = pgTable(
  'shift',
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
    startTime: timestamp('start_time', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    endTime: timestamp('end_time', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    label: varchar('label', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Leads with participation_id, so it also serves participation-only lookups.
    index('shift_participation_block_idx').on(
      table.participationId,
      table.eventTimeBlockId,
    ),
    index('shift_event_time_block_idx').on(table.eventTimeBlockId),
    check('shift_duration_check', sql`${table.startTime} < ${table.endTime}`),
  ],
);

export const shiftRequirement = pgTable(
  'shift_requirement',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    participationId: uuid('participation_id')
      .notNull()
      .references(() => ministryParticipation.id, { onDelete: 'cascade' }),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shift.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    sectorId: uuid('sector_id')
      .notNull()
      .references(() => sector.id, { onDelete: 'cascade' }),
    peopleNeeded: integer('people_needed').default(1).notNull(),
    notes: text('notes'),
  },
  (table) => [
    index('shift_requirement_participation_idx').on(table.participationId),
    uniqueIndex('shift_requirement_shift_sector_role_idx').on(
      table.shiftId,
      table.sectorId,
      table.roleId,
    ),
    check(
      'shift_requirement_min_people_needed_check',
      sql`${table.peopleNeeded} >= 1`,
    ),
  ],
);
