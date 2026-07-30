import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';

// Better Auth's `organization` plugin owns these three tables. Their shape is
// dictated by the plugin's own schema declaration (see
// `better-auth/plugins/organization`), so columns are mirrored verbatim —
// including the absence of an `updated_at` on all three. Teams are disabled, so
// the plugin's `team`/`team_member` tables and the `invitation.team_id` column
// are deliberately absent.
//
// One exception: every organization identifier is a `uuid` rather than the
// plugin's generic `text`. An organization row *is* a Church, and `church` and
// every `church_id` foreign key beneath it are `uuid` — a text primary key
// could not be referenced by them. `packages/auth` therefore configures
// `advanced.database.generateId` with a UUID *function*, so the values Better
// Auth mints fit. Not the `'uuid'` shorthand — see the note there.

export const organization = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').default('member').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    // App-owned extension column, same exception as the `uuid` id above: the
    // plugin never writes or reads it, so it is safe to add outside its
    // schema declaration. Set on every successful Active Church entry —
    // auto-select and explicit selection alike — never by Better Auth itself.
    lastOpenedAt: timestamp('last_opened_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => [
    index('member_organizationId_idx').on(table.organizationId),
    index('member_userId_idx').on(table.userId),
  ],
);

export const invitation = pgTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').default('pending').notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('invitation_organizationId_idx').on(table.organizationId),
    index('invitation_email_idx').on(table.email),
  ],
);

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  inviter: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));
