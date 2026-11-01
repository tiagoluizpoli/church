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
import { cycleStateEnum } from './enums';

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

export interface UsualSetupHeadcount {
  sectorId: string;
  roleId: string;
  peopleNeeded: number;
}

export const cycle = pgTable(
  'cycle',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    startDate: date('start_date', { mode: 'date' }).notNull(),
    endDate: date('end_date', { mode: 'date' }).notNull(),
    state: cycleStateEnum('state').default('draft').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check('cycle_date_check', sql`${table.startDate} < ${table.endDate}`),
    index('cycle_church_state_idx').on(table.churchId, table.state),
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
      sql`lower(${table.name})`,
    ),
  ],
);

export const templateTimeBlock = pgTable(
  'template_time_block',
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
    check(
      'template_time_block_time_not_empty_check',
      sql`${table.startTime} != ${table.endTime}`,
    ),
    uniqueIndex('template_time_block_template_order_idx').on(
      table.templateId,
      table.order,
    ),
    uniqueIndex('template_time_block_template_label_idx').on(
      table.templateId,
      sql`lower(${table.label})`,
    ),
  ],
);

export const usualSetup = pgTable(
  'usual_setup',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    ministryId: uuid('ministry_id')
      .notNull()
      .references(() => ministry.id, { onDelete: 'cascade' }),
    sourceTemplateTimeBlockId: uuid('source_template_time_block_id')
      .notNull()
      .references(() => templateTimeBlock.id, { onDelete: 'cascade' }),
    serves: boolean('serves').default(true).notNull(),
    shiftSplit: jsonb('shift_split').$type<ShiftSplitSpec>().notNull(),
    headcounts: jsonb('headcounts')
      .$type<UsualSetupHeadcount[]>()
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
    uniqueIndex('usual_setup_ministry_block_idx').on(
      table.ministryId,
      table.sourceTemplateTimeBlockId,
    ),
  ],
);
