import * as schema from '@church/db/schema';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auth } from '../src/index';
import { clearDatabase, testDb } from './setup';

/**
 * A Church *is* an `organization` row, and `church` — plus every `church_id`
 * foreign key beneath it — is a `uuid` column. So every id Better Auth mints
 * has to be a UUID.
 *
 * The trap this guards: `advanced.database.generateId: 'uuid'` reads like the
 * right setting and type-checks, but it means "the database generates the
 * UUID". Better Auth's own `user`, `session` and `account` tables are `text`
 * columns with no default, so under the shorthand every insert fails on a null
 * id — and nothing catches it until a real sign-up runs.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DeclaredDatabaseOptions {
  generateId?: unknown;
}

interface AdapterOrganizationRow {
  id: string;
  name: string;
  slug: string;
}

interface AdapterMemberRow {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
}

describe('Better Auth id generation', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('generates ids in JS rather than deferring them to the database', () => {
    const database = auth.options.advanced?.database as
      | DeclaredDatabaseOptions
      | undefined;
    expect(typeof database?.generateId).toBe('function');
  });

  it('mints a uuid when it creates a user', async () => {
    const result = await auth.api.signUpEmail({
      body: {
        email: 'id-generation@test.com',
        password: 'id-generation-password',
        name: 'Id Generation',
      },
    });

    expect(result.user.id).toMatch(UUID_PATTERN);

    const [persisted] = await testDb
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, result.user.id));
    expect(persisted?.email).toBe('id-generation@test.com');
  });

  it('mints a uuid for the session and account rows behind that user', async () => {
    const result = await auth.api.signUpEmail({
      body: {
        email: 'id-generation-session@test.com',
        password: 'id-generation-password',
        name: 'Id Generation Session',
      },
    });

    const accounts = await testDb
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, result.user.id));
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.id).toMatch(UUID_PATTERN);

    const sessions = await testDb
      .select()
      .from(schema.session)
      .where(eq(schema.session.userId, result.user.id));
    for (const session of sessions) {
      expect(session.id).toMatch(UUID_PATTERN);
    }
  });

  /**
   * The organization tables are the reason the ids are UUIDs at all, so they
   * are the ones that must be proved against Better Auth's own writer rather
   * than against `@church/db`'s seeding helpers. Everything else in the
   * codebase inserts organizations through Drizzle directly; without this, an
   * `organization.id` minted by the adapter is never once exercised against
   * the `uuid` column it has to land in.
   *
   * Written through the adapter, not `auth.api.createOrganization`: Churches
   * are provisioned by the Platform Operator and never over HTTP, so that
   * endpoint is deliberately shut (`allowUserToCreateOrganization: false`).
   */
  it('mints an organization id a church extension row can be keyed by', async () => {
    const signUp = await auth.api.signUpEmail({
      body: {
        email: 'id-generation-org@test.com',
        password: 'id-generation-password',
        name: 'Id Generation Org',
      },
    });

    const { adapter } = await auth.$context;

    const organization = await adapter.create<
      Record<string, unknown>,
      AdapterOrganizationRow
    >({
      model: 'organization',
      data: { name: 'Adapter Church', slug: 'adapter-church' },
    });

    expect(organization.id).toMatch(UUID_PATTERN);

    const member = await adapter.create<
      Record<string, unknown>,
      AdapterMemberRow
    >({
      model: 'member',
      data: {
        organizationId: organization.id,
        userId: signUp.user.id,
        role: 'admin',
      },
    });

    expect(member.organizationId).toBe(organization.id);

    // The whole point of the uuid retype: this insert has a foreign key onto
    // `organization.id` and would fail if the adapter's id did not fit it.
    await testDb
      .insert(schema.church)
      .values({ id: organization.id, timezone: 'UTC' });

    const [churchRow] = await testDb
      .select()
      .from(schema.church)
      .where(eq(schema.church.id, organization.id));
    expect(churchRow?.id).toBe(organization.id);
  });
});
