import { auth } from '@church/auth';
import { signInForE2e } from './e2e-sign-in';

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

/**
 * E2E-only helper: mints a plain Church Invitation (Better Auth's own
 * `createInvitation`, not the app's Ministry Invitation) so a second E2E
 * actor can join the Church already bootstrapped by
 * `e2e-provision-church.ts` + `e2e-redeem-church-invitation.ts`, exactly as
 * a ChurchAdmin would invite an ordinary Church Member in production.
 */
const input = parseInput();
const { cookie } = await signInForE2e({
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
