import type { ministryInvitation } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  RoleId,
  UserId,
} from '../../domain/branded-ids';
import type { MinistryInvitationProps } from '../../domain/entities/ministry-invitation';
import { MinistryInvitation } from '../../domain/entities/ministry-invitation';
import type { MinistryAccessLevel } from '../../domain/entities/ministry-volunteer';

type MinistryInvitationRow = InferSelectModel<typeof ministryInvitation>;

export function mapMinistryInvitation(
  row: MinistryInvitationRow,
  roleIds: RoleId[] = [],
): MinistryInvitation {
  const props: MinistryInvitationProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId as MinistryId,
    inviteeUserId: row.inviteeUserId
      ? (row.inviteeUserId as UserId)
      : undefined,
    churchInvitationId: row.churchInvitationId ?? undefined,
    ministryAccessLevel: row.ministryAccessLevel as MinistryAccessLevel,
    status: row.status,
    inviterId: row.inviterId as UserId,
    expiresAt: row.expiresAt,
    roleIds,
  };

  return new MinistryInvitation(
    props,
    row.id as MinistryInvitationId,
    row.createdAt,
    row.updatedAt,
  );
}
