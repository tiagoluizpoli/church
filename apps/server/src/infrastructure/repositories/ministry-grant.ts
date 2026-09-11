import { ministryVolunteer, ministryVolunteerRole } from '@church/db';
import type { AnyDrizzleDb } from './types';

export interface InsertMinistryVolunteerMembershipInput {
  db: AnyDrizzleDb;
  churchId: string;
  ministryId: string;
  volunteerId: string;
  ministryAccessLevel: 'leader' | 'volunteer';
}

/**
 * Shared by checkpoint-three redemption (`DrizzleRedemptionRepository`) and
 * Volunteer Transfer (`DrizzleVolunteerTransferRepository`) — both grant a
 * fresh `ministry_volunteer` row at the invitation's Access Level.
 */
export async function insertMinistryVolunteerMembership({
  db,
  churchId,
  ministryId,
  volunteerId,
  ministryAccessLevel,
}: InsertMinistryVolunteerMembershipInput): Promise<string> {
  const [membership] = await db
    .insert(ministryVolunteer)
    .values({ churchId, ministryId, volunteerId, ministryAccessLevel })
    .returning({ id: ministryVolunteer.id });
  if (!membership) throw new Error('Ministry membership insert failed');
  return membership.id;
}

export interface GrantMinistryVolunteerRolesInput {
  db: AnyDrizzleDb;
  churchId: string;
  ministryVolunteerId: string;
  roleIds: string[];
}

/** Grants the invitation's Role qualifications; a no-op for an empty list. */
export async function grantMinistryVolunteerRoles({
  db,
  churchId,
  ministryVolunteerId,
  roleIds,
}: GrantMinistryVolunteerRolesInput): Promise<void> {
  if (roleIds.length === 0) return;
  await db
    .insert(ministryVolunteerRole)
    .values(
      roleIds.map((roleId) => ({ churchId, ministryVolunteerId, roleId })),
    )
    .onConflictDoNothing();
}
