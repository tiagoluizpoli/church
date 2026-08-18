import { auth } from '@church/auth';
import { signInForE2e } from './e2e-sign-in';

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
const session = await signInForE2e({
  email: input.email,
  password: input.password,
});
await auth.api.acceptInvitation({
  headers: new Headers({ cookie: session.cookie }),
  body: { invitationId: input.invitationId },
});
console.log(JSON.stringify({ user: { id: session.userId } }));
