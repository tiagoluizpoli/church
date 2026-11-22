import type { ChurchAccessLevel } from '../authority/types';
import type { MinistryId, MinistryInvitationId, RoleId } from '../branded-ids';
import type { MinistryAccessLevel } from './ministry-membership';

/** One Ministry grant a signed-in acceptance would make. */
export interface RedemptionBundleMinistry {
  ministryInvitationId: MinistryInvitationId;
  ministryId: MinistryId;
  ministryName: string;
  ministryAccessLevel: MinistryAccessLevel;
  roleIds: RoleId[];
  roleNames: string[];
  inviterName: string;
  expiresAt: Date;
}

/**
 * Everything one signed-in acceptance grants: a chained offer's pending
 * Church Invitation and every pending, unexpired half; a standalone Ministry
 * offer alone; a plain Church Invitation with no such half alone.
 */
export interface RedemptionBundle {
  /** The Church Access Level granted; null when the Church Membership already exists. */
  churchAccessLevel: ChurchAccessLevel | null;
  /** The Church Invitation's expiry while the Church half is in the bundle; else null. */
  churchExpiresAt: Date | null;
  /** Oldest first. */
  ministries: RedemptionBundleMinistry[];
}
