import { auth } from '@church/auth';
import { z } from 'zod';

export interface E2eSignInInput {
  email: string;
  password: string;
}

export interface E2eSession {
  userId: string;
  cookie: string;
}

const signInResponseSchema = z.object({
  user: z.object({ id: z.string() }),
});

/**
 * Shared by the E2E-only scripts that build a session in-process (no
 * incoming HTTP request to read a cookie from), mirroring how
 * `BetterAuthRedemptionIdentityGateway` signs in after `signUpEmail`.
 */
export async function signInForE2e({
  email,
  password,
}: E2eSignInInput): Promise<E2eSession> {
  const response = await auth.handler(
    new Request('http://localhost/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  );
  const cookie = response.headers.get('set-cookie');
  const body = signInResponseSchema.safeParse(await response.json());
  if (!response.ok || !cookie || !body.success) {
    throw new Error('Better Auth did not create a session cookie.');
  }
  return { userId: body.data.user.id, cookie };
}
