import { adminAc, memberAc } from 'better-auth/plugins/organization/access';

/**
 * The organization role set, configured to exactly `member | admin`.
 *
 * Better Auth ships a third `owner` tier by default. It is deliberately not
 * adopted and not mapped onto `admin`: a level the domain cannot name would
 * need a new glossary term and a new branch in the policy engine. Passing this
 * object as the plugin's `roles` option replaces the default set outright —
 * both permission resolution and the endpoints' accepted-role validation read
 * from it — so `owner` is not a role any caller can name.
 */
export const organizationRoles = {
  member: memberAc,
  admin: adminAc,
};

/** The role the creator of an organization receives, in place of `owner`. */
export const organizationCreatorRole = 'admin';
