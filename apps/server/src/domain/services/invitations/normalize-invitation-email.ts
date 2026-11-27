import type { NormalizeInvitationEmailInput } from './normalize-invitation-email.types';

/** The one canonical address form for member lookup, Church offers, locks and uniqueness. */
export function normalizeInvitationEmail({
  email,
}: NormalizeInvitationEmailInput): string {
  return email.trim().toLowerCase();
}
