import { appConfig } from '@church/app-config';
import { type CreateAuthInput, createAuth } from '@church/auth';
import { db } from '@church/db';

export type ServerAuthOptions = Omit<CreateAuthInput, 'database'>;

export type CreateServerAuthInput = Pick<CreateAuthInput, 'database'>;

/** The one policy set every server auth instance is built from. */
export const serverAuthOptions: ServerAuthOptions = {
  organizationMembershipLimit: appConfig.auth.organizationMembershipLimit,
};

/** Same configuration, any database: the request instance or a transaction. */
export function createServerAuth({ database }: CreateServerAuthInput) {
  return createAuth({ database, ...serverAuthOptions });
}

export type ServerAuthFactory = typeof createServerAuth;

export const auth = createServerAuth({ database: db });
