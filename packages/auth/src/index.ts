import { createDb } from '@church/db';
import * as authSchema from '@church/db/schema/auth';
import * as organizationSchema from '@church/db/schema/organization';
import { env } from '@church/env/server';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins/organization';
import { assertConfiguredRole } from './organization/assert-configured-role';
import {
  organizationCreatorRole,
  organizationRoles,
} from './organization/roles';

const schema = { ...authSchema, ...organizationSchema };

type AuthDatabase = Parameters<typeof drizzleAdapter>[0];

type ResetPasswordMailer = NonNullable<
  NonNullable<BetterAuthOptions['emailAndPassword']>['sendResetPassword']
>;

export interface CreateAuthInput {
  /** Drizzle database or transaction the adapter reads and writes through. */
  database: AuthDatabase;
  /** Per-user Church membership cap; omitted keeps Better Auth's default. */
  organizationMembershipLimit?: number;
  /** Reset token lifetime in seconds; omitted keeps Better Auth's default. */
  resetPasswordTokenExpiresIn?: number;
  /** Omitted leaves password reset unavailable (no mail can be sent). */
  sendResetPassword?: ResetPasswordMailer;
  revokeSessionsOnPasswordReset?: boolean;
}

// Church-specific policy and email composition are supplied by the server at
// construction time, so there is no startup callback to race and no
// auth -> server import. Transaction-bound instances call this same function.
export function createAuth({
  database,
  organizationMembershipLimit,
  resetPasswordTokenExpiresIn,
  sendResetPassword,
  revokeSessionsOnPasswordReset,
}: CreateAuthInput) {
  const isSecureOrigin = env.BETTER_AUTH_URL.startsWith('https://');

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: 'pg',

      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
      resetPasswordTokenExpiresIn,
      sendResetPassword,
      revokeSessionsOnPasswordReset,
    },
    // Public registration and Church Access Level changes are deliberately
    // unavailable. Redemption and app-managed access changes use trusted
    // server APIs, which do not traverse these HTTP routes.
    disabledPaths: ['/sign-up/email', '/organization/update-member-role'],
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      database: {
        // An `organization` row *is* a Church, and `church` plus every
        // `church_id` foreign key beneath it are `uuid`. Better Auth's default
        // id format would not fit those columns, so every id it mints is a
        // UUID.
        //
        // The function form, not the `'uuid'` shorthand: the shorthand stops
        // generating ids in JS and leaves them to the database, and Better
        // Auth's own tables (`user`, `session`, `account`) are `text` columns
        // with no default, so every insert would fail on a null id.
        generateId: () => crypto.randomUUID(),
      },
      defaultCookieAttributes: {
        // `Secure` cookies are silently dropped by browsers over plain HTTP
        // (e.g. LAN-IP dev access from a phone) — only require it, and the
        // stricter `SameSite=None` it implies, when actually serving HTTPS.
        sameSite: isSecureOrigin ? 'none' : 'lax',
        secure: isSecureOrigin,
        httpOnly: true,
      },
    },
    plugins: [
      organization({
        roles: organizationRoles,
        creatorRole: organizationCreatorRole,
        // Churches are provisioned by the Platform Operator, never over HTTP,
        // so the plugin's create-organization route stays shut.
        allowUserToCreateOrganization: false,
        membershipLimit: organizationMembershipLimit,
        // Better Auth treats any custom `generateId` as predictable and then
        // requires a verified email to accept or reject an invitation by id.
        // Ours mints random UUIDs, and redemption proves the mailbox with its
        // own emailed code before the account exists, so that gate does not
        // apply; leaving it on rejects every newly redeemed User.
        requireEmailVerificationOnInvitation: false,
        // No invitation mailer: the plugin therefore sends nothing and mints no
        // token or link. Invitation delivery is the application's own concern.
        organizationHooks: {
          // The plugin's own role validation still accepts its built-in
          // `owner`, and `add-member` validates nothing. These close it.
          beforeAddMember: async ({ member }) => {
            assertConfiguredRole({ role: member.role });
          },
          beforeUpdateMemberRole: async ({ newRole }) => {
            assertConfiguredRole({ role: newRole });
          },
          beforeCreateInvitation: async ({ invitation }) => {
            assertConfiguredRole({ role: invitation.role });
          },
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export const auth = createAuth({ database: createDb() });
