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
import { eventStatusEnum, eventTypeEnum } from './enums';
import { ministryParticipation } from './participation';
import { eventTemplate, planningCycle, timeBlock } from './planning';

export const event = pgTable(
  'event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    planningCycleId: uuid('planning_cycle_id')
      .notNull()
      .references(() => planningCycle.id, { onDelete: 'cascade' }),
    sourceTemplateId: uuid('source_template_id').references(
      () => eventTemplate.id,
      { onDelete: 'set null' },
    ),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    location: varchar('location', { length: 255 }),
    startDate: timestamp('start_date', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    endDate: timestamp('end_date', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    status: eventStatusEnum('status').default('draft').notNull(),
    eventType: eventTypeEnum('event_type').default('hourly').notNull(),
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
    check('event_date_check', sql`${table.startDate} < ${table.endDate}`),
  ],
);

export const timeSlot = pgTable(
  'time_slot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    sourceTemplateBlockId: uuid('source_template_block_id').references(
      () => timeBlock.id,
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
      'timeslot_duration_check',
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
    timeSlotId: uuid('time_slot_id')
      .notNull()
      .references(() => timeSlot.id, { onDelete: 'cascade' }),
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

export const slotRequirement = pgTable(
  'slot_requirement',
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
    requiredCount: integer('required_count').default(1).notNull(),
    notes: text('notes'),
  },
  (table) => [
    check('slot_requirement_min_count_check', sql`${table.requiredCount} >= 1`),
  ],
);
