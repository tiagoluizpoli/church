import { auth } from '@church/auth';
import { z } from 'zod';

interface E2eMintChurchInvitationInput {
  inviterEmail: string;
  inviterPassword: string;
  inviteeEmail: string;
  organizationId: string;
  role: 'member' | 'admin';
}

function parseInput(): E2eMintChurchInvitationInput {
  const [inviterEmail, inviterPassword, inviteeEmail, organizationId, role] =
    Bun.argv.slice(2);
  if (
    !inviterEmail ||
    !inviterPassword ||
    !inviteeEmail ||
    !organizationId ||
    (role !== 'member' && role !== 'admin')
  ) {
    throw new Error(
      'Expected inviterEmail, inviterPassword, inviteeEmail, organizationId, and role ("member" or "admin") arguments.',
    );
  }
  return { inviterEmail, inviterPassword, inviteeEmail, organizationId, role };
}

const signInResponseSchema = z.object({
  user: z.object({ id: z.string() }),
});

interface SignInInput {
  email: string;
  password: string;
}

async function signIn({ email, password }: SignInInput): Promise<string> {
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
  return cookie;
}

/**
 * E2E-only helper: mints a plain Church Invitation (Better Auth's own
 * `createInvitation`, not the app's Ministry Invitation) so a second E2E
 * actor can join the Church already bootstrapped by
 * `e2e-provision-church.ts` + `e2e-redeem-church-invitation.ts`, exactly as
 * a ChurchAdmin would invite an ordinary Church Member in production.
 */
const input = parseInput();
const cookie = await signIn({
  email: input.inviterEmail,
  password: input.inviterPassword,
});
const invitation = await auth.api.createInvitation({
  headers: new Headers({ cookie }),
  body: {
    email: input.inviteeEmail,
    role: input.role,
    organizationId: input.organizationId,
  },
});
console.log(JSON.stringify({ invitationId: invitation.id }));
