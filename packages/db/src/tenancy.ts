import type { ExtractTablesWithRelations, SQL } from 'drizzle-orm';
import { and, eq } from 'drizzle-orm';
import type {
  NodePgDatabase,
  NodePgQueryResultHKT,
} from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import * as schema from './schema';

/**
 * A Church is two rows sharing one identifier: the Better Auth `organization`
 * row that owns its name and slug, and the `church` extension row that owns its
 * timezone and settings. Writing one without the other produces a tenant that
 * either has no identity or has no members — so nothing writes them separately.
 *
 * These are the seeding and bootstrap primitives. Platform Operator
 * provisioning, when it lands, is the production path built on the same shape.
 *
 * Every function takes the writer, so a caller that needs the two rows to
 * commit together — provisioning does — passes its transaction instead of the
 * pooled db.
 *
 * Why these live in `@church/db` rather than `apps/server`, where the
 * constitution puts domain logic: their callers are this package's own seeds
 * and scripts, `@church/auth`, and `apps/server`. Hosting them in the server
 * app would make two packages depend on an app. What belongs in `apps/server`
 * is the Platform Operator provisioning operation — the domain act, with its
 * collision rules and its first Church Invitation — and it will be written in
 * terms of these.
 */

export type TenancyWriter =
  | NodePgDatabase<typeof schema>
  | PgTransaction<
      NodePgQueryResultHKT,
      typeof schema,
      ExtractTablesWithRelations<typeof schema>
    >;

/**
 * The Access Level of one Church Membership. Named for the domain term, not
 * the `member.role` column it is stored in — CONTEXT.md reserves "Role" for a
 * function a Volunteer performs within a Ministry.
 */
export type ChurchAccessLevel = 'member' | 'admin';

// `z.guid()`, not `z.uuid()`: the latter enforces the RFC 4122 version/variant
// nibbles, which Postgres's own `uuid` column type does not — and the E2E seed's
// deliberately-readable ids (e.g. `e2e11111-...`) are valid UUIDs by that laxer
// standard. Every real Church id (Better Auth's `organization.id`) is already a
// proper UUID regardless of which check runs, so nothing is lost here.
export const ChurchIdSchema = z.guid().brand<'ChurchId'>();
export type ChurchId = z.infer<typeof ChurchIdSchema>;

export const ChurchSlugSchema = z.string().trim().min(1).brand<'ChurchSlug'>();
export type ChurchSlug = z.infer<typeof ChurchSlugSchema>;

const ChurchMembershipUserIdSchema = z.string().min(1).brand<'UserId'>();

export interface CreateChurchInput {
  db: TenancyWriter;
  name: string;
  slug: string;
  /** Supply only when a fixture pins the identifier; otherwise the DB mints it. */
  id?: string;
  timezone?: string;
  settings?: Record<string, unknown>;
}

export interface ChurchRecord {
  id: ChurchId;
  name: string;
  slug: ChurchSlug;
  timezone: string;
}

export interface AddChurchMemberInput {
  db: TenancyWriter;
  churchId: string;
  userId: string;
  accessLevel?: ChurchAccessLevel;
}

export interface FindChurchBySlugInput {
  db: TenancyWriter;
  slug: string;
}

export interface FindChurchByIdInput {
  db: TenancyWriter;
  id: string;
}

export interface FindAnyChurchInput {
  db: TenancyWriter;
}

export class ChurchIdentityConflictError extends Error {
  constructor({ id, slug }: CreateChurchInput) {
    super(`Church id "${id}" conflicts with slug "${slug}".`);
    this.name = 'ChurchIdentityConflictError';
  }
}

interface SelectChurchInput {
  db: TenancyWriter;
  where?: SQL;
}

const churchRecordColumns = {
  id: schema.organization.id,
  name: schema.organization.name,
  slug: schema.organization.slug,
  timezone: schema.church.timezone,
};

/** The one join that reassembles a Church from its two rows. */
async function selectChurch(
  input: SelectChurchInput,
): Promise<ChurchRecord | undefined> {
  const query = input.db
    .select(churchRecordColumns)
    .from(schema.organization)
    .innerJoin(schema.church, eq(schema.church.id, schema.organization.id));

  const [row] = input.where ? await query.where(input.where) : await query;
  if (!row) return undefined;

  return {
    id: ChurchIdSchema.parse(row.id),
    name: row.name,
    slug: ChurchSlugSchema.parse(row.slug),
    timezone: row.timezone,
  };
}

async function createChurchInTransaction(
  input: CreateChurchInput,
): Promise<ChurchRecord> {
  const [organization] = await input.db
    .insert(schema.organization)
    .values({
      ...(input.id === undefined ? {} : { id: ChurchIdSchema.parse(input.id) }),
      name: input.name,
      slug: ChurchSlugSchema.parse(input.slug),
    })
    .returning();

  if (!organization) {
    throw new Error(`Failed to create organization for church: ${input.slug}`);
  }

  const [church] = await input.db
    .insert(schema.church)
    .values({
      id: organization.id,
      timezone: input.timezone ?? 'UTC',
      settings: input.settings ?? {},
    })
    .returning();

  if (!church) {
    throw new Error(`Failed to create church extension row: ${input.slug}`);
  }

  return {
    id: ChurchIdSchema.parse(organization.id),
    name: organization.name,
    slug: ChurchSlugSchema.parse(organization.slug),
    timezone: church.timezone,
  };
}

/** Creates both halves of a Church atomically, even for pooled-db callers. */
export async function createChurch(
  input: CreateChurchInput,
): Promise<ChurchRecord> {
  return await input.db.transaction(async (tx) =>
    createChurchInTransaction({ ...input, db: tx }),
  );
}

/**
 * Converges a repeatedly-run seed on the Church it made the first time rather
 * than colliding on the unique slug.
 *
 * A pinned `id` is matched on first, because callers that pin one — the E2E
 * seed does — hardcode that same id into every row beneath it. Returning a
 * same-slug Church under a different id would leave those inserts pointing at
 * a Church that is not the one this call produced.
 */
export async function ensureChurch(
  input: CreateChurchInput,
): Promise<ChurchRecord> {
  const id =
    input.id === undefined ? undefined : ChurchIdSchema.parse(input.id);
  const slug = ChurchSlugSchema.parse(input.slug);

  if (id !== undefined) {
    const pinned = await findChurchById({ db: input.db, id });
    if (pinned) {
      if (pinned.slug !== slug) {
        throw new ChurchIdentityConflictError(input);
      }
      return pinned;
    }
  }

  const existing = await findChurchBySlug({ db: input.db, slug });
  if (existing && id !== undefined && existing.id !== id) {
    throw new ChurchIdentityConflictError(input);
  }
  return existing ?? (await createChurch({ ...input, id, slug }));
}

/**
 * Better Auth's `member` table carries no unique index on
 * `(organization_id, user_id)`, so a re-run of an idempotent seed would
 * otherwise give one person two Church Memberships in the same Church. The
 * repeated runs converge the stored Access Level on the caller's requested one.
 *
 * This is check-then-insert, not a constraint: two seeds racing each other can
 * still both insert. Nothing runs them concurrently today, and the index that
 * would close it belongs to Better Auth's table.
 */
export async function addChurchMember(
  input: AddChurchMemberInput,
): Promise<void> {
  const churchId = ChurchIdSchema.parse(input.churchId);
  const userId = ChurchMembershipUserIdSchema.parse(input.userId);
  const [existing] = await input.db
    .select({ id: schema.member.id, role: schema.member.role })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, churchId),
        eq(schema.member.userId, userId),
      ),
    );

  const accessLevel = input.accessLevel ?? 'member';
  if (existing) {
    if (existing.role !== accessLevel) {
      await input.db
        .update(schema.member)
        .set({ role: accessLevel })
        .where(eq(schema.member.id, existing.id));
    }
    return;
  }

  await input.db.insert(schema.member).values({
    id: crypto.randomUUID(),
    organizationId: churchId,
    userId,
    role: accessLevel,
  });
}

export async function findChurchBySlug(
  input: FindChurchBySlugInput,
): Promise<ChurchRecord | undefined> {
  return await selectChurch({
    db: input.db,
    where: eq(schema.organization.slug, ChurchSlugSchema.parse(input.slug)),
  });
}

export async function findChurchById(
  input: FindChurchByIdInput,
): Promise<ChurchRecord | undefined> {
  return await selectChurch({
    db: input.db,
    where: eq(schema.organization.id, ChurchIdSchema.parse(input.id)),
  });
}

/** Whichever Church the database happens to hold — seeds only. */
export async function findAnyChurch(
  input: FindAnyChurchInput,
): Promise<ChurchRecord | undefined> {
  return await selectChurch({ db: input.db });
}
