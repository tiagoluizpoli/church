import { adminAc, memberAc } from 'better-auth/plugins/organization/access';

/**
 * The organization role set, configured to exactly `member | admin`.
 *
 * Better Auth ships a third `owner` tier by default. It is deliberately not
 * adopted and not mapped onto `admin`: a level the domain cannot name would
 * need a new glossary term and a new branch in the policy engine.
 *
 * Passing this object as the plugin's `roles` option replaces the default set
 * for *permission resolution* — `hasPermission` reads `options.roles` alone.
 * It does **not** narrow the endpoints' accepted-role validation, which unions
 * the plugin's own `{ admin, owner, member }` with these; `add-member` does not
 * validate the role at all. `assertConfiguredRole` closes that gap.
 */
export const organizationRoles = {
  member: memberAc,
  admin: adminAc,
};

export type OrganizationRole = keyof typeof organizationRoles;

/** The role the creator of an organization receives, in place of `owner`. */
export const organizationCreatorRole: OrganizationRole = 'admin';
