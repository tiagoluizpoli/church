import * as authSchema from '@church/db/schema/auth';
import * as organizationSchema from '@church/db/schema/organization';
import { getTableColumns } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { auth } from '../src/index';
import {
  organizationCreatorRole,
  organizationRoles,
} from '../src/organization/roles';

interface DeclaredField {
  required?: boolean;
}

interface DeclaredModel {
  fields: Record<string, DeclaredField>;
}

interface OrganizationPluginShape {
  id: string;
  schema: Record<string, DeclaredModel>;
  options: {
    roles?: Record<string, unknown>;
    creatorRole?: string;
    sendInvitationEmail?: unknown;
    allowUserToCreateOrganization?: boolean | ((user: never) => unknown);
  };
}

const drizzleTables: Record<string, PgTable> = {
  organization: organizationSchema.organization,
  member: organizationSchema.member,
  invitation: organizationSchema.invitation,
  session: authSchema.session,
};

function getOrganizationPlugin(): OrganizationPluginShape {
  const plugin = auth.options.plugins?.find(
    (candidate) => candidate.id === 'organization',
  );
  if (!plugin) throw new Error('organization plugin is not enabled');
  return plugin as unknown as OrganizationPluginShape;
}

describe('organization plugin', () => {
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
    expect(options.creatorRole).not.toBe('owner');
    expect(JSON.stringify(Object.keys(organizationRoles))).not.toContain(
      'owner',
    );
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
