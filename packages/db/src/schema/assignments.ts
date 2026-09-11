import { sql } from 'drizzle-orm';
import {
  check,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { availabilityCheck } from './availability-checks';
import { church } from './church';
import { role, volunteer } from './core';
import { assignmentStatusEnum, auditActionEnum } from './enums';
import { ministryParticipation } from './participation';
import { shift } from './scheduling';

export const assignment = pgTable(
  'assignment',
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
    uniqueIndex('assignment_shift_volunteer_idx')
      .on(table.shiftId, table.volunteerId)
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
    availabilityCheckId: uuid('availability_check_id')
      .notNull()
      .references(() => availabilityCheck.id, { onDelete: 'cascade' }),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shift.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('availability_check_shift_idx').on(
      table.availabilityCheckId,
      table.shiftId,
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
  /**
   * Correlation id of the wider act that produced this row, when it had one —
   * e.g. a Volunteer Transfer's cancellations (spec §4.4/§8.4) are reached
   * through this table by `correlationId`. Null for ordinary rostering edits.
   */
  correlationId: text('correlation_id'),
  timestamp: timestamp('timestamp', {
    withTimezone: true,
    mode: 'date',
  })
    .defaultNow()
    .notNull(),
});
