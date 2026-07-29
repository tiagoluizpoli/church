import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
  ministryAccessLevelEnum,
  teamAccessLevelEnum,
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

/**
 * A retired profile (`leftAt` set) keeps its original `churchId` forever, so
 * every assignment, membership and availability record hanging off it stays
 * attributed to the Church that actually received the service — the row is
 * never moved or deleted, only superseded. `successorVolunteerId` makes the
 * chain walkable without an audit query. Retirement is an axis independent of
 * `status`, which keeps meaning "currently servable".
 */
export const volunteer = pgTable(
  'volunteer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    status: volunteerStatusEnum('status').default('active').notNull(),
    notes: text('notes'),
    leftAt: timestamp('left_at', { withTimezone: true, mode: 'date' }),
    successorVolunteerId: uuid('successor_volunteer_id').references(
      (): AnyPgColumn => volunteer.id,
    ),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    /** One *active* profile per User — the structural backstop against a double transfer. */
    uniqueIndex('volunteer_user_id_active_idx')
      .on(table.userId)
      .where(sql`${table.leftAt} IS NULL`),
  ],
);

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
 * Junction table linking Volunteers to Ministries.
 *
 * Team membership hangs off `ministry_volunteer_team` (many-to-many, no primary
 * team) and role qualification off `ministry_volunteer_role`.
 *
 * **Access Level Model**: Leadership is NOT stored as a column on `team` or
 * `ministry`. Instead, `ministry_access_level` on this join table designates
 * ministry-wide leadership, and `ministry_volunteer_team.access_level`
 * designates leadership scoped to a specific team.
 *
 * - `leader`     → Ministry Leader (full ministry authority)
 * - `volunteer`   → Regular member
 *
 * TeamLeader is no longer a value here: it is a `ministry_volunteer_team`
 * row with `access_level: 'leader'`, scoped only to the teams that row
 * points at — not a ministry-wide deputy.
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
  /** Ministry-wide access level — sole source of truth for ministry leadership designation. */
  ministryAccessLevel: ministryAccessLevelEnum('ministry_access_level')
    .default('volunteer')
    .notNull(),
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
  ministryId: uuid('ministry_id')
    .notNull()
    .references(() => ministry.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
});

/**
 * Qualification: which roles a ministry member is able to fill.
 *
 * Hung off the **membership**, not the volunteer, because roles are
 * ministry-scoped and one person can serve in several ministries. Every role
 * requires a ministry — there are no global roles.
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
    /** Team-scoped access level — TeamLeader is a row here at `'leader'`, scoped only to this team. */
    accessLevel: teamAccessLevelEnum('access_level')
      .default('member')
      .notNull(),
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
