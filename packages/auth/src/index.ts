import { createDb } from '@church/db';
import * as schema from '@church/db/schema/auth';
import { env } from '@church/env/server';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export function createAuth() {
  const db = createDb();

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
        sameSite: 'none',
        secure: true,
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
