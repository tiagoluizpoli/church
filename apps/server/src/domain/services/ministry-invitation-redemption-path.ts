export interface MinistryInvitationRedemptionPathInput {
  id: string;
  /** Set only for a paired invitation, whose public link is its Church half's. */
  churchInvitationId?: string;
}

/**
 * Relative path only — never an absolute URL (spec §6.2). Shared by the API
 * response mapper and the outbox drainer's email composition. A paired
 * invitation links to its Church Invitation; the server resolves the
 * Ministry half from it.
 */
export function redemptionPathFor(
  invitation: MinistryInvitationRedemptionPathInput,
): string {
  return invitation.churchInvitationId
    ? `/invitations/church/${invitation.churchInvitationId}`
    : `/invitations/ministry/${invitation.id}`;
}
