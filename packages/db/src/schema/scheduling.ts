import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { church } from './church';
import { role, team } from './core';
import { eventStatusEnum } from './enums';
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
  (table) => [check('event_date_check', sql`${table.start} < ${table.end}`)],
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
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'event_time_block_duration_check',
      sql`${table.startTime} < ${table.endTime}`,
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
    teamId: uuid('team_id').references(() => team.id, { onDelete: 'set null' }),
    peopleNeeded: integer('people_needed').default(1).notNull(),
    notes: text('notes'),
  },
  (table) => [
    check(
      'shift_requirement_min_people_needed_check',
      sql`${table.peopleNeeded} >= 1`,
    ),
  ],
);
