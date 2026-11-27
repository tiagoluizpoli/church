import type { ministryInvitation } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type { RoleId } from '../../domain/branded-ids';

export type MinistryInvitationRow = InferSelectModel<typeof ministryInvitation>;

export interface MapMinistryInvitationInput {
  row: MinistryInvitationRow;
  roleIds?: RoleId[];
}
