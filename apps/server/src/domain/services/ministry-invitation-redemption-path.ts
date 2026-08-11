export interface MinistryInvitationRedemptionPathInput {
  id: string;
  kind: 'ministry-only' | 'chained';
}

/**
 * Relative path only — never an absolute URL (spec §6.2). Shared by the API
 * response mapper and the outbox drainer's email composition.
 *
 * Both branches key off the Ministry Invitation's own `id` — the redemption
 * controller/repository look it up by `ministryInvitation.id` regardless of
 * kind (see `findPublicRedemptionPreview`); `churchInvitationId` is Better
 * Auth's own, separate invitation-record id and was never a valid lookup key
 * here.
 */
export function redemptionPathFor(
  invitation: MinistryInvitationRedemptionPathInput,
): string {
  return invitation.kind === 'chained'
    ? `/invitations/church/${invitation.id}`
    : `/invitations/ministry/${invitation.id}`;
}
