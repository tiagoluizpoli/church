import type { ministryInvitation } from '@church/db';
import { fromDate } from '@church/time';
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
import type { MinistryAccessLevel } from '../../domain/entities/ministry-membership';

type MinistryInvitationRow = InferSelectModel<typeof ministryInvitation>;

export interface MapMinistryInvitationInput {
  row: MinistryInvitationRow;
  roleIds?: RoleId[];
}

export function mapMinistryInvitation({
  row,
  roleIds = [],
}: MapMinistryInvitationInput): MinistryInvitation {
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
    expiresAt: fromDate({ date: row.expiresAt }),
    roleIds,
    lastResendAt: row.lastResendAt
      ? fromDate({ date: row.lastResendAt })
      : undefined,
    resendCount: row.resendCount,
    resendWindowStartedAt: row.resendWindowStartedAt
      ? fromDate({ date: row.resendWindowStartedAt })
      : undefined,
  };

  return new MinistryInvitation({
    props,
    id: row.id as MinistryInvitationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
