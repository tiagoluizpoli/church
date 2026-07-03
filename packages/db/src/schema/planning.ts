import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { church } from './church';
import { ministry } from './core';
import { planningCycleStateEnum } from './enums';

export interface EqualShiftSplitSpec {
  kind: 'equal';
  count: number;
}

export interface ManualShiftSpan {
  label?: string;
  startTime: string;
  endTime: string;
}

export interface ManualShiftSplitSpec {
  kind: 'manual';
  spans: ManualShiftSpan[];
}

export type ShiftSplitSpec = EqualShiftSplitSpec | ManualShiftSplitSpec;

export interface ServingProfileHeadcount {
  roleId: string;
  teamId?: string;
  count: number;
}

export const planningCycle = pgTable(
  'planning_cycle',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    startDate: date('start_date', { mode: 'date' }).notNull(),
    endDate: date('end_date', { mode: 'date' }).notNull(),
    state: planningCycleStateEnum('state').default('draft').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      'planning_cycle_date_check',
      sql`${table.startDate} < ${table.endDate}`,
    ),
    index('planning_cycle_church_state_idx').on(table.churchId, table.state),
  ],
);

export const eventTemplate = pgTable(
  'event_template',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    weekday: integer('weekday').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      'event_template_weekday_check',
      sql`${table.weekday} >= 0 AND ${table.weekday} <= 6`,
    ),
    uniqueIndex('event_template_church_name_idx').on(
      table.churchId,
      table.name,
    ),
  ],
);

export const timeBlock = pgTable(
  'time_block',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => eventTemplate.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 255 }).notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    order: integer('order').notNull(),
  },
  (table) => [
    check('time_block_time_check', sql`${table.startTime} < ${table.endTime}`),
    uniqueIndex('time_block_template_order_idx').on(
      table.templateId,
      table.order,
    ),
  ],
);

export const ministryServingProfile = pgTable(
  'ministry_serving_profile',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    ministryId: uuid('ministry_id')
      .notNull()
      .references(() => ministry.id, { onDelete: 'cascade' }),
    sourceTemplateBlockId: uuid('source_template_block_id')
      .notNull()
      .references(() => timeBlock.id, { onDelete: 'cascade' }),
    serves: boolean('serves').default(true).notNull(),
    shiftSplit: jsonb('shift_split').$type<ShiftSplitSpec>().notNull(),
    headcounts: jsonb('headcounts')
      .$type<ServingProfileHeadcount[]>()
      .default([])
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('serving_profile_ministry_block_idx').on(
      table.ministryId,
      table.sourceTemplateBlockId,
    ),
  ],
);
