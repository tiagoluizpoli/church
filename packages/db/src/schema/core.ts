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
import {
  defaultDirectionEnum,
  enforcementTypeEnum,
  membershipStatusEnum,
  systemRoleEnum,
  volunteerStatusEnum,
} from './enums';

export const ministry = pgTable('ministry', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id')
    .notNull()
    .references(() => church.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  enforcementType: enforcementTypeEnum('enforcement_type')
    .default('soft')
    .notNull(),
  defaultDirection: defaultDirectionEnum('default_direction')
    .default('all_out')
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const volunteer = pgTable('volunteer', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  churchId: uuid('church_id')
    .notNull()
    .references(() => church.id, { onDelete: 'cascade' }),
  status: volunteerStatusEnum('status').default('active').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const team = pgTable('team', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id')
    .notNull()
    .references(() => church.id, { onDelete: 'cascade' }),
  ministryId: uuid('ministry_id')
    .notNull()
    .references(() => ministry.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
});

/**
 * Junction table linking Volunteers to Ministries (and optionally Teams).
 *
 * **Contextual Leadership Model**: Leadership is NOT stored as a column on
 * `team` or `ministry`. Instead, `system_role` on this join table is the
 * sole mechanism for designating leadership within a ministry/team context.
 *
 * - `leader`     → Ministry Leader (full ministry authority)
 * - `sub_leader`  → Team Leader (delegated authority within a team)
 * - `volunteer`   → Regular member
 */
export const ministryVolunteer = pgTable('ministry_volunteer', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id')
    .notNull()
    .references(() => church.id, { onDelete: 'cascade' }),
  volunteerId: uuid('volunteer_id')
    .notNull()
    .references(() => volunteer.id, { onDelete: 'cascade' }),
  ministryId: uuid('ministry_id')
    .notNull()
    .references(() => ministry.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id').references(() => team.id, { onDelete: 'set null' }),
  /** Contextual leadership role — sole source of truth for leadership designation. */
  systemRole: systemRoleEnum('system_role').default('volunteer').notNull(),
  status: membershipStatusEnum('status').default('active').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const role = pgTable('role', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id')
    .notNull()
    .references(() => church.id, { onDelete: 'cascade' }),
  ministryId: uuid('ministry_id').references(() => ministry.id, {
    onDelete: 'cascade',
  }),
  name: varchar('name', { length: 255 }).notNull(),
  isGlobal: boolean('is_global').default(false).notNull(),
});

/**
 * Qualification: which roles a ministry member is able to fill.
 *
 * Hung off the **membership**, not the volunteer, because roles are
 * ministry-scoped and one person can serve in several ministries. A row may
 * point at a global role (`role.is_global`, `role.ministry_id IS NULL`); the
 * qualification still applies only within this membership's ministry.
 *
 * Team is a separate axis — eligibility composes at query time as
 * "qualified for the role AND (requirement has no team OR the volunteer
 * belongs to that team)". There are deliberately no `(role, team)` rows.
 */
export const ministryVolunteerRole = pgTable(
  'ministry_volunteer_role',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    ministryVolunteerId: uuid('ministry_volunteer_id')
      .notNull()
      .references(() => ministryVolunteer.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('ministry_volunteer_role_membership_role_idx').on(
      table.ministryVolunteerId,
      table.roleId,
    ),
  ],
);

/**
 * Team membership for a ministry member — flat many-to-many, no primary team.
 *
 * Replaces the single `ministry_volunteer.team_id` column: a member of Kids can
 * belong to both "2-4 yrs" and "5-14 yrs".
 */
export const ministryVolunteerTeam = pgTable(
  'ministry_volunteer_team',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    ministryVolunteerId: uuid('ministry_volunteer_id')
      .notNull()
      .references(() => ministryVolunteer.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('ministry_volunteer_team_membership_team_idx').on(
      table.ministryVolunteerId,
      table.teamId,
    ),
  ],
);

export const churchAdmin = pgTable(
  'church_admin',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('church_admin_church_user_idx').on(
      table.churchId,
      table.userId,
    ),
  ],
);
