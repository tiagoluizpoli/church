export interface ResolveInvitationEmailInput {
  /** Resolved by joining `inviteeUserId` to the `user` table — set only for an existing-member invitation. */
  inviteeEmail: string | null;
  /** Resolved by joining `churchInvitationId` to Better Auth's `invitation` table — set only for a chained invitation. */
  churchInvitationEmail: string | null;
}
