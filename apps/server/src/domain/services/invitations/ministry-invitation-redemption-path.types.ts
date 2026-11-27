export interface MinistryInvitationRedemptionPathInput {
  id: string;
  /** Set only for a paired invitation, whose public link is its Church half's. */
  churchInvitationId?: string;
}
