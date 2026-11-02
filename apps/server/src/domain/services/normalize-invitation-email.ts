interface NormalizeInvitationEmailInput {
  email: string;
}

/** The one canonical address form for member lookup, Church offers, locks and uniqueness. */
export function normalizeInvitationEmail({
  email,
}: NormalizeInvitationEmailInput): string {
  return email.trim().toLowerCase();
}
