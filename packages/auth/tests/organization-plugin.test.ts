import * as authSchema from '@church/db/schema/auth';
import * as organizationSchema from '@church/db/schema/organization';
import { getTableColumns } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { auth } from '../src/index';
import {
  organizationCreatorRole,
  organizationRoles,
} from '../src/organization/roles';
import { clearDatabase } from './setup';

interface DeclaredField {
  required?: boolean;
}

interface DeclaredModel {
  fields: Record<string, DeclaredField>;
}

interface DeclaredPluginOptions {
  roles?: Record<string, unknown>;
  creatorRole?: string;
  sendInvitationEmail?: unknown;
  allowUserToCreateOrganization?: boolean | ((user: never) => unknown);
}

interface OrganizationPluginShape {
  id: string;
  schema: Record<string, DeclaredModel>;
  options: DeclaredPluginOptions;
}

interface AuthUser {
  id: string;
}

interface AuthResponse {
  user: AuthUser;
  cookie: string;
}

interface SignUpInput {
  email: string;
}

interface CreatedOrganization {
  id: string;
}

interface CreatedMember {
  id: string;
}

interface OrganizationFixture {
  organizationId: string;
  candidateUserId: string;
  memberId: string;
  adminCookie: string;
}

interface RequestOrganizationEndpointInput {
  path: string;
  body: Record<string, string>;
  cookie?: string;
}

interface AddMemberRequestBody {
  userId: string;
  organizationId: string;
  role: string;
}

interface AddMemberRequest {
  body: AddMemberRequestBody;
}

type AddMemberEndpoint = (input: AddMemberRequest) => Promise<unknown>;

const drizzleTables: Record<string, PgTable> = {
  organization: organizationSchema.organization,
  member: organizationSchema.member,
  invitation: organizationSchema.invitation,
  session: authSchema.session,
};

// Better Auth narrows its generated server API to configured roles. This test
// intentionally exercises hostile transport input, which reaches the hook
// before persistence.
const addMemberEndpoint = auth.api.addMember as unknown as AddMemberEndpoint;

function getOrganizationPlugin(): OrganizationPluginShape {
  const plugin = auth.options.plugins?.find(
    (candidate) => candidate.id === 'organization',
  );
  if (!plugin) throw new Error('organization plugin is not enabled');
  return plugin as unknown as OrganizationPluginShape;
}

async function signUp({ email }: SignUpInput): Promise<AuthResponse> {
  const body = await auth.api.signUpEmail({
    body: {
      email,
      name: email,
      password: 'organization-role-password',
    },
  });
  if (!body.token) throw new Error('Auth fixture session token is missing.');
  const response = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'organization-role-password' }),
    }),
  );
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!response.ok || !cookie)
    throw new Error('Auth fixture session cookie is missing.');
  return { user: body.user, cookie };
}

async function createOrganizationFixture(): Promise<OrganizationFixture> {
  const admin = await signUp({ email: 'admin@example.com' });
  const candidate = await signUp({ email: 'candidate@example.com' });
  const member = await signUp({ email: 'member@example.com' });
  const { adapter } = await auth.$context;
  const organization = await adapter.create<
    Record<string, unknown>,
    CreatedOrganization
  >({
    model: 'organization',
    data: { name: 'Role Test Church', slug: 'role-test-church' },
  });
  await adapter.create<Record<string, unknown>, CreatedMember>({
    model: 'member',
    data: {
      organizationId: organization.id,
      userId: admin.user.id,
      role: 'admin',
    },
  });
  const existingMember = await adapter.create<
    Record<string, unknown>,
    CreatedMember
  >({
    model: 'member',
    data: {
      organizationId: organization.id,
      userId: member.user.id,
      role: 'member',
    },
  });
  return {
    organizationId: organization.id,
    candidateUserId: candidate.user.id,
    memberId: existingMember.id,
    adminCookie: admin.cookie,
  };
}

async function requestOrganizationEndpoint({
  path,
  body,
  cookie,
}: RequestOrganizationEndpointInput): Promise<Response> {
  return await auth.handler(
    new Request(`http://localhost:3000/api/auth/organization/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

describe('organization plugin', () => {
  let fixture: OrganizationFixture;

  beforeAll(async () => {
    await clearDatabase();
    fixture = await createOrganizationFixture();
  });

  it('is enabled on the auth instance', () => {
    expect(getOrganizationPlugin().id).toBe('organization');
  });

  it('configures the role set to exactly member and admin', () => {
    expect(Object.keys(organizationRoles).sort()).toEqual(['admin', 'member']);
    expect(
      Object.keys(getOrganizationPlugin().options.roles ?? {}).sort(),
    ).toEqual(['admin', 'member']);
  });

  it("gives an organization's creating user the admin role", () => {
    expect(organizationCreatorRole).toBe('admin');
    expect(getOrganizationPlugin().options.creatorRole).toBe('admin');
  });

  it("neither uses nor maps Better Auth's owner tier", () => {
    const { options } = getOrganizationPlugin();
    expect(options.roles).not.toHaveProperty('owner');
    expect(organizationRoles).not.toHaveProperty('owner');
    expect(options.creatorRole).not.toBe('owner');
  });

  it.each([
    'owner',
    'admin,owner',
  ])('rejects %s through add-member', async (role) => {
    await expect(
      addMemberEndpoint({
        body: {
          userId: fixture.candidateUserId,
          organizationId: fixture.organizationId,
          role,
        },
      }),
    ).rejects.toThrow();
  });

  it.each([
    'owner',
    'admin,owner',
  ])('rejects %s through update-member-role', async (role) => {
    const response = await requestOrganizationEndpoint({
      path: 'update-member-role',
      cookie: fixture.adminCookie,
      body: {
        memberId: fixture.memberId,
        organizationId: fixture.organizationId,
        role,
      },
    });
    expect(response.status).toBe(400);
  });

  it.each([
    'owner',
    'admin,owner',
  ])('rejects %s through invite-member', async (role) => {
    const response = await requestOrganizationEndpoint({
      path: 'invite-member',
      cookie: fixture.adminCookie,
      body: {
        email: 'invited@example.com',
        organizationId: fixture.organizationId,
        role,
      },
    });
    expect(response.status).toBe(400);
  });

  it('leaves the invitation mailer unset so the plugin sends nothing', () => {
    expect(getOrganizationPlugin().options.sendInvitationEmail).toBeUndefined();
  });

  it('does not expose organization creation over HTTP', () => {
    expect(getOrganizationPlugin().options.allowUserToCreateOrganization).toBe(
      false,
    );
  });

  it('backs every field the plugin declares with a drizzle column', () => {
    const { schema } = getOrganizationPlugin();

    for (const [modelName, model] of Object.entries(schema)) {
      const table = drizzleTables[modelName];
      expect(table, `no drizzle table for model "${modelName}"`).toBeDefined();
      if (!table) continue;

      const columns = getTableColumns(table);
      for (const [fieldName, field] of Object.entries(model.fields)) {
        const column = columns[fieldName];
        expect(column, `${modelName}.${fieldName} is missing`).toBeDefined();
        expect(
          column?.notNull,
          `${modelName}.${fieldName} nullability mismatch`,
        ).toBe(field.required === true);
      }
    }
  });

  it('declares no team tables while teams are disabled', () => {
    const { schema } = getOrganizationPlugin();
    expect(schema).not.toHaveProperty('team');
    expect(schema).not.toHaveProperty('teamMember');
    expect(schema.invitation?.fields).not.toHaveProperty('teamId');
  });
});
