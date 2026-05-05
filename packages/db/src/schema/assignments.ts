import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { church } from './church';
import { role, volunteer } from './core';
import {
  assignmentStatusEnum,
  auditActionEnum,
  availabilityTypeEnum,
} from './enums';
import { timeSlot } from './scheduling';

export const assignment = pgTable(
  'assignment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    slotId: uuid('slot_id')
      .notNull()
      .references(() => timeSlot.id, { onDelete: 'cascade' }),
    volunteerId: uuid('volunteer_id')
      .notNull()
      .references(() => volunteer.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    status: assignmentStatusEnum('status').default('pending').notNull(), // pending, confirmed, declined
    reason: text('reason'),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
    assignedBy: text('assigned_by').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    uniqueIndex('assignment_slot_volunteer_idx').on(
      table.slotId,
      table.volunteerId,
    ),
  ],
);

export const availability = pgTable('availability', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id')
    .notNull()
    .references(() => church.id, { onDelete: 'cascade' }),
  volunteerId: uuid('volunteer_id')
    .notNull()
    .references(() => volunteer.id, { onDelete: 'cascade' }),
  type: availabilityTypeEnum('type').default('unavailable').notNull(), // available, unavailable
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  isAllDay: boolean('is_all_day').default(false).notNull(),
  reason: varchar('reason', { length: 255 }),
  repeatRule: varchar('repeat_rule', { length: 255 }),
});

export const assignmentAudit = pgTable('assignment_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id')
    .notNull()
    .references(() => church.id, { onDelete: 'cascade' }),
  assignmentId: uuid('assignment_id')
    .notNull()
    .references(() => assignment.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  action: auditActionEnum('action').notNull(),
  reason: text('reason'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});
