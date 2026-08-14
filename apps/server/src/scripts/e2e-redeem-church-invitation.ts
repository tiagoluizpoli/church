import { auth } from '@church/auth';
import { z } from 'zod';

interface E2eRedeemChurchInvitationInput {
  email: string;
  name: string;
  password: string;
  invitationId: string;
}

function parseInput(): E2eRedeemChurchInvitationInput {
  const [email, name, password, invitationId] = Bun.argv.slice(2);
  if (!email || !name || !password || !invitationId) {
    throw new Error(
      'Expected email, name, password, and invitationId arguments.',
    );
  }
  return { email, name, password, invitationId };
}

interface CreateAuthenticatedSessionInput {
  email: string;
  password: string;
}

interface AuthenticatedSession {
  userId: string;
  cookie: string;
}

const signInResponseSchema = z.object({
  user: z.object({ id: z.string() }),
});

/**
 * Mirrors `BetterAuthRedemptionIdentityGateway`'s own sign-in helper: this
 * script has no incoming HTTP request to read a cookie from, so it builds a
 * session the same way redemption does after `signUpEmail`.
 */
async function createAuthenticatedSession({
  email,
  password,
}: CreateAuthenticatedSessionInput): Promise<AuthenticatedSession> {
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

/**
 * E2E-only stand-in for the still-unbuilt public Church-only redemption
 * journey (issue #62's bootstrap admin case has no app-owned UI/API yet —
 * see `provision-church.ts`). Calls Better Auth's own real
 * `signUpEmail`/`acceptInvitation` server API in-process, the same way
 * `BetterAuthRedemptionIdentityGateway` does for the chained flow — this is
 * genuine invitation redemption, not a mock, just without the app's
 * verification-code/UI layer that only chained/Ministry invitations have.
 */
const input = parseInput();
try {
  await auth.api.signUpEmail({
    body: { email: input.email, name: input.name, password: input.password },
  });
} catch {
  // Already exists — the invited email may belong to an existing User
  // (spec 024 §2.4); fall through and sign in instead.
}
const session = await createAuthenticatedSession({
  email: input.email,
  password: input.password,
});
await auth.api.acceptInvitation({
  headers: new Headers({ cookie: session.cookie }),
  body: { invitationId: input.invitationId },
});
console.log(JSON.stringify({ user: { id: session.userId } }));
