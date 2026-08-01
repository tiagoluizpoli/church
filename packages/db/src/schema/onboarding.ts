import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { church } from './church';
import { ministry, role } from './core';
import {
  ministryAccessLevelEnum,
  ministryInvitationStatusEnum,
  outboxMessageKindEnum,
  outboxMessageStatusEnum,
} from './enums';
import { invitation as churchInvitation } from './organization';

/**
 * A Ministry Invitation is targeted, never a bearer link: exactly one of
 * `inviteeUserId` (an existing Church Member) or `churchInvitationId` (the
 * chained Better Auth invitation for someone outside the Church) is set,
 * enforced by a check constraint rather than an application convention.
 * There is no `expired` status — expiry is evaluated lazily against
 * `expiresAt` at read time, matching Better Auth rather than diverging
 * from it.
 */
export const ministryInvitation = pgTable(
  'ministry_invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    ministryId: uuid('ministry_id')
      .notNull()
      .references(() => ministry.id, { onDelete: 'cascade' }),
    inviteeUserId: text('invitee_user_id').references(() => user.id, {
      onDelete: 'cascade',
    }),
    churchInvitationId: text('church_invitation_id').references(
      () => churchInvitation.id,
      { onDelete: 'cascade' },
    ),
    ministryAccessLevel: ministryAccessLevelEnum(
      'ministry_access_level',
    ).notNull(),
    status: ministryInvitationStatusEnum('status').default('pending').notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    acceptedAt: timestamp('accepted_at', {
      withTimezone: true,
      mode: 'date',
    }),
    canceledAt: timestamp('canceled_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastResendAt: timestamp('last_resend_at', {
      withTimezone: true,
      mode: 'date',
    }),
    resendCount: integer('resend_count').default(0).notNull(),
    resendWindowStartedAt: timestamp('resend_window_started_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('ministry_invitation_ministry_invitee_pending_idx')
      .on(table.ministryId, table.inviteeUserId)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex('ministry_invitation_ministry_church_invitation_pending_idx')
      .on(table.ministryId, table.churchInvitationId)
      .where(sql`${table.status} = 'pending'`),
    check(
      'ministry_invitation_exactly_one_addressee_check',
      sql`(${table.inviteeUserId} IS NOT NULL) <> (${table.churchInvitationId} IS NOT NULL)`,
    ),
  ],
);

/**
 * One replaceable verification-code lifecycle per pending Ministry Invitation.
 * Only the SHA-256 digest persists. A resend replaces the digest, expiry and
 * attempt count, deliberately invalidating every previously issued code.
 */
export const invitationVerificationCode = pgTable(
  'invitation_verification_code',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ministryInvitationId: uuid('ministry_invitation_id')
      .notNull()
      .references(() => ministryInvitation.id, { onDelete: 'cascade' })
      .unique(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    failedAttempts: integer('failed_attempts').default(0).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
    lastSentAt: timestamp('last_sent_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

/**
 * Mirrors `ministry_volunteer_role` with real FKs rather than a `uuid[]`
 * column, so a Role deleted between mint and acceptance cascades out of
 * the pending invitation instead of needing existence checking at
 * acceptance time. Under-granting is the deliberately lenient default —
 * acceptance proceeds regardless.
 */
export const ministryInvitationRole = pgTable(
  'ministry_invitation_role',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    ministryInvitationId: uuid('ministry_invitation_id')
      .notNull()
      .references(() => ministryInvitation.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('ministry_invitation_role_invitation_role_idx').on(
      table.ministryInvitationId,
      table.roleId,
    ),
  ],
);

/**
 * One general, Church-scoped outbox serving invitation emails and
 * Volunteer-Transfer notifications alike — one worker, one retry policy,
 * one place support looks. The payload references its subject by id and is
 * rendered at send time, so a message never carries a stale copy. Nothing
 * drains this table yet — the worker lands with delivery (a later ticket).
 */
export const outboxMessage = pgTable('outbox_message', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id')
    .notNull()
    .references(() => church.id, { onDelete: 'cascade' }),
  kind: outboxMessageKindEnum('kind').notNull(),
  payload: jsonb('payload').notNull(),
  status: outboxMessageStatusEnum('status').default('pending').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  scheduledFor: timestamp('scheduled_for', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  lastError: text('last_error'),
  providerMessageId: text('provider_message_id'),
  correlationId: text('correlation_id').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
