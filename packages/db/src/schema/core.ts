import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { church } from './church';
import {
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
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
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
  leaderId: uuid('leader_id').references(() => volunteer.id, {
    onDelete: 'set null',
  }),
});

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
  systemRole: systemRoleEnum('system_role').default('volunteer').notNull(),
  status: membershipStatusEnum('status').default('active').notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
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
