import type {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  RoleId,
  UserId,
} from '../../branded-ids';
import type { MinistryInvitation } from '../../entities/ministry-invitation';
import type { MinistryAccessLevel } from '../../entities/ministry-volunteer';

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

export interface IMinistryInvitationManager {
  mint(input: MintMinistryInvitationInput): Promise<MinistryInvitation>;
  resend(input: ResendMinistryInvitationInput): Promise<MinistryInvitation>;
}
