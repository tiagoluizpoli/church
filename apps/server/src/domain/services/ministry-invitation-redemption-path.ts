export interface MinistryInvitationRedemptionPathInput {
  id: string;
  kind: 'ministry-only' | 'chained';
  churchInvitationId?: string;
}

/** Relative path only — never an absolute URL (spec §6.2). Shared by the API
 * response mapper and the outbox drainer's email composition. */
export function redemptionPathFor(
  invitation: MinistryInvitationRedemptionPathInput,
): string {
  return invitation.kind === 'chained'
    ? `/invitations/church/${invitation.churchInvitationId}`
    : `/invitations/ministry/${invitation.id}`;
}
