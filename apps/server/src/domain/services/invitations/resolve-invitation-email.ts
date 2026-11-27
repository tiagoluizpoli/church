import type { ResolveInvitationEmailInput } from './resolve-invitation-email.types';

/**
 * `ministry_invitation_exactly_one_addressee_check` (packages/db/src/schema/onboarding.ts)
 * guarantees exactly one of `inviteeUserId` / `churchInvitationId` is ever set
 * on a real row, so exactly one of these two inputs should ever be non-null.
 * The throw below is a defensive assertion for a state the database already
 * makes impossible — deliberately a hard failure (HTTP 500 via the global
 * error handler), not a typed outcome: every real caller-facing failure mode
 * here already has one, and adding another just to cover unreachable input
 * would be dead weight.
 */
export function resolveInvitationEmail({
  inviteeEmail,
  churchInvitationEmail,
}: ResolveInvitationEmailInput): string {
  const email = inviteeEmail ?? churchInvitationEmail;
  if (!email) {
    throw new Error(
      'Ministry invitation has neither an invitee User nor a Church Invitation to resolve an email from.',
    );
  }
  return email;
}
