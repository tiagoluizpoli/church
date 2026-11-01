import type { ChurchAccessLevel } from '../authority/types';
import type {
  ChurchId,
  ChurchInvitationId,
  MinistryInvitationId,
} from '../branded-ids';
import type { MinistryAccessLevel } from './ministry-membership';

/** The optional Ministry half of a paired Church Invitation. */
export interface PublicRedemptionMinistry {
  ministryInvitationId: MinistryInvitationId;
  ministryName: string;
  ministryAccessLevel: MinistryAccessLevel;
  roleNames: string[];
}

export interface PublicRedemptionPreview {
  churchId: ChurchId;
  churchInvitationId: ChurchInvitationId;
  email: string;
  churchName: string;
  churchAccessLevel: ChurchAccessLevel;
  expiresAt: Date;
  /** Null for a plain Church Invitation, such as the first-admin one. */
  ministry: PublicRedemptionMinistry | null;
}
