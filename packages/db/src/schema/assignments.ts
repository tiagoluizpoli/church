import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
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
import { event, timeSlot } from './scheduling';

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
    assignedAt: timestamp('assigned_at', {
      withTimezone: true,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
    assignedBy: text('assigned_by').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    // Partial: a volunteer may hold only one ACTIVE assignment per slot.
    // Declined/cancelled rows are excluded so a volunteer can be re-assigned
    // (or substituted in) after declining the same slot.
    uniqueIndex('assignment_slot_volunteer_idx')
      .on(table.slotId, table.volunteerId)
      .where(sql`${table.status} IN ('draft', 'pending', 'confirmed')`),
    check(
      'assignment_status_check',
      sql`${table.status} IN ('draft', 'pending', 'confirmed', 'declined', 'cancelled')`,
    ),
  ],
);

export const availability = pgTable(
  'availability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    volunteerId: uuid('volunteer_id')
      .notNull()
      .references(() => volunteer.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => event.id, {
      onDelete: 'cascade',
    }),
    type: availabilityTypeEnum('type').default('unavailable').notNull(), // available, unavailable
    startTime: timestamp('start_time', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    endTime: timestamp('end_time', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    isAllDay: boolean('is_all_day').default(false).notNull(),
    reason: varchar('reason', { length: 255 }),
    repeatRule: varchar('repeat_rule', { length: 255 }),
  },
  (table) => [
    index('availability_church_volunteer_event_idx').on(
      table.churchId,
      table.volunteerId,
      table.eventId,
    ),
    check(
      'availability_time_check',
      sql`${table.startTime} < ${table.endTime}`,
    ),
  ],
);

export const assignmentAudit = pgTable('assignment_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id')
    .notNull()
    .references(() => church.id, { onDelete: 'cascade' }),
  assignmentId: uuid('assignment_id')
    .notNull()
    .references(() => assignment.id, { onDelete: 'cascade' }),
  actorId: text('actor_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  action: auditActionEnum('action').notNull(),
  reason: text('reason'),
  timestamp: timestamp('timestamp', {
    withTimezone: true,
    mode: 'date',
  })
    .defaultNow()
    .notNull(),
});
