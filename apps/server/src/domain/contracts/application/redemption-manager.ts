import type {
  ChurchId,
  MinistryInvitationId,
  UserId,
  VolunteerId,
} from '../../branded-ids';

export interface AcceptPendingMinistryInvitationInput {
  churchId: ChurchId;
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  acceptedAt: Date;
}

/** Owns checkpoint three from spec §7.4; no HTTP transport is in #98. */
export interface RedemptionManager {
  acceptPendingMinistryInvitation(
    input: AcceptPendingMinistryInvitationInput,
  ): Promise<VolunteerId>;
}
