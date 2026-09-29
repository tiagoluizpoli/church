import { account, user } from '@church/db';
import type { SeedWriter } from '../recipe';
import { requireInsertedRow } from './require-inserted-row';

export type SeededUser = typeof user.$inferSelect;

export interface BuildAuthenticatableUserInput {
  db: SeedWriter;
  id: string;
  name: string;
  email: string;
  /** Hashed once by the recipe and shared, because hashing is deliberately slow. */
  passwordHash: string;
}

/**
 * A User that can sign in with email and password: a verified `user` row plus
 * the Better Auth `credential` account that holds the password hash.
 */
export async function buildAuthenticatableUser({
  db,
  id,
  name,
  email,
  passwordHash,
}: BuildAuthenticatableUserInput): Promise<SeededUser> {
  const seededUser = requireInsertedRow({
    rows: await db
      .insert(user)
      .values({ id, name, email: email.toLowerCase(), emailVerified: true })
      .returning(),
    description: `User ${email}`,
  });

  await db.insert(account).values({
    id: `credential-${id}`,
    accountId: id,
    providerId: 'credential',
    userId: id,
    password: passwordHash,
  });

  return seededUser;
}
