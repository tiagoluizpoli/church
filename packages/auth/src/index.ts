import { createDb } from '@church/db';
import * as schema from '@church/db/schema/auth';
import { env } from '@church/env/server';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export function createAuth() {
  const db = createDb();
  const isSecureOrigin = env.BETTER_AUTH_URL.startsWith('https://');

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',

      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        // `Secure` cookies are silently dropped by browsers over plain HTTP
        // (e.g. LAN-IP dev access from a phone) — only require it, and the
        // stricter `SameSite=None` it implies, when actually serving HTTPS.
        sameSite: isSecureOrigin ? 'none' : 'lax',
        secure: isSecureOrigin,
        httpOnly: true,
      },
    },
    plugins: [],
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            const { handleSoftRegistration } = await import(
              './hooks/soft-registration'
            );
            await handleSoftRegistration(session.userId);
          },
        },
      },
    },
  });
}

export const auth = createAuth();
