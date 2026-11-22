import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organization } from './organization';

// A Church *is* an `organization` row. Its `name` and `slug` live there (written
// through the app's Church Settings endpoints; Better Auth's update route is
// closed), and this table is the domain extension of that same row, carrying
// only what Better Auth has no column for.
// Sharing the primary key is what keeps every `church_id` foreign key across
// scheduling, participation and planning resolving unchanged.
export const church = pgTable('church', {
  id: uuid('id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  timezone: text('timezone').default('UTC').notNull(),
  settings: jsonb('settings').default({}),
  website: text('website'),
  accentColor: text('accent_color'),
  // Object-storage key of the logo (never a URL); old keys' objects are kept.
  logoKey: text('logo_key'),
});

// Declared on this side only: `organization.ts` is Better Auth's territory and
// importing `church` back into it would make the two modules circular.
export const churchRelations = relations(church, ({ one }) => ({
  organization: one(organization, {
    fields: [church.id],
    references: [organization.id],
  }),
}));

// A place the Church uses. Exactly one row per Church is the Main Address
// whenever any exist: the partial unique index allows at most one, and the
// deferred `church_address_main_trigger` (hand-written in the migration, no
// DSL for it) refuses a Church left with addresses but no main.
export const churchAddress = pgTable(
  'church_address',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    label: text('label'),
    street: text('street').notNull(),
    // 's/n' when the place has no number.
    number: text('number').notNull(),
    complement: text('complement'),
    bairro: text('bairro').notNull(),
    city: text('city').notNull(),
    uf: text('uf').notNull(),
    cep: text('cep'),
    country: text('country').default('BR').notNull(),
    isPublic: boolean('is_public').default(true).notNull(),
    isMain: boolean('is_main').default(false).notNull(),
    position: integer('position').notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    pinSource: text('pin_source'),
    placeId: text('place_id'),
  },
  (table) => [
    index('church_address_church_position_idx').on(
      table.churchId,
      table.position,
    ),
    uniqueIndex('church_address_main_idx')
      .on(table.churchId)
      .where(sql`${table.isMain}`),
    check('church_address_country_check', sql`${table.country} = 'BR'`),
    check('church_address_cep_check', sql`${table.cep} ~ '^[0-9]{8}$'`),
    check(
      'church_address_pin_check',
      sql`(${table.latitude} IS NULL) = (${table.longitude} IS NULL) AND (${table.latitude} IS NULL) = (${table.pinSource} IS NULL) AND ${table.pinSource} IN ('google', 'cep', 'admin')`,
    ),
  ],
);

// Every Church Slug a Church gave up stays reserved to it forever. `slug` is
// unique across Churches; a live slug (organization.slug) is kept disjoint
// from this table by the slug-change write, which is the only writer.
export const churchSlugHistory = pgTable(
  'church_slug_history',
  {
    slug: text('slug').primaryKey(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('church_slug_history_church_id_idx').on(table.churchId)],
);

// Church Contacts: how people reach the Church. Private unless `isPublic`.
// `value` is E.164 for a phone, lower-case for an email; `position` is the
// admin's order. Saved whole with the Church Settings, so rows are replaced.
export const churchContact = pgTable(
  'church_contact',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => church.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['email', 'phone'] }).notNull(),
    phoneType: text('phone_type', { enum: ['mobile', 'landline'] }),
    value: text('value').notNull(),
    description: text('description'),
    isWhatsApp: boolean('is_whatsapp').default(false).notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    index('church_contact_church_id_position_idx').on(
      table.churchId,
      table.position,
    ),
  ],
);
