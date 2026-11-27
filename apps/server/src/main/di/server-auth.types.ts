import type { CreateAuthInput } from '@church/auth';
import type { createServerAuth } from './server-auth';

export type ServerAuthOptions = Omit<CreateAuthInput, 'database'>;

export type CreateServerAuthInput = Pick<CreateAuthInput, 'database'>;

export type ServerAuthFactory = typeof createServerAuth;
