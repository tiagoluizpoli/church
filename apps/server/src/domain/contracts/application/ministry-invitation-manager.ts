import type {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  RoleId,
  UserId,
} from '../../branded-ids';
import type { MinistryInvitation } from '../../entities/ministry-invitation';
import type { MinistryAccessLevel } from '../../entities/ministry-volunteer';

/**
 * The minting API's own delivery-status vocabulary (spec #56 §6.4) — kept
 * independent of `OutboxMessageStatus` (an infrastructure contract this
 * application contract may not import) even though the two currently share
 * the same values; `DbMinistryInvitationManager` is the one place that
 * bridges them.
 */
export const MINISTRY_INVITATION_DELIVERY_STATUS_OPTIONS = [
  'pending',
  'sent',
  'failed',
] as const;
export type MinistryInvitationDeliveryStatus =
  (typeof MINISTRY_INVITATION_DELIVERY_STATUS_OPTIONS)[number];

export interface MintMinistryInvitationInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  /** The caller — resolves both the invitation's `inviterId` and its own authority. */
  inviterId: UserId;
  email: string;
  ministryAccessLevel: MinistryAccessLevel;
  roleIds: RoleId[];
}

export interface ResendMinistryInvitationInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  ministryInvitationId: MinistryInvitationId;
  /** The caller — resend requires the same minting authority as creation. */
  callerId: UserId;
}

export interface GetMinistryInvitationDeliveryStatusInput {
  churchId: ChurchId;
  ministryInvitationId: MinistryInvitationId;
}

export interface IMinistryInvitationManager {
  mint(input: MintMinistryInvitationInput): Promise<MinistryInvitation>;
  resend(input: ResendMinistryInvitationInput): Promise<MinistryInvitation>;
  /**
   * The live delivery status of an invitation's most recent outbox message
   * (spec #56 §6.4) — read separately from `mint`/`resend` so both keep
   * returning the bare `MinistryInvitation` they always have.
   */
  getDeliveryStatus(
    input: GetMinistryInvitationDeliveryStatusInput,
  ): Promise<MinistryInvitationDeliveryStatus>;
}
