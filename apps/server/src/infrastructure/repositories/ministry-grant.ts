import { ministryMembership, ministryMembershipRole } from '@church/db';
import type { AnyDrizzleDb } from './types';

export interface InsertMinistryMembershipInput {
  db: AnyDrizzleDb;
  churchId: string;
  ministryId: string;
  volunteerId: string;
  ministryAccessLevel: 'leader' | 'volunteer';
}

/**
 * Shared by checkpoint-three redemption (`DrizzleRedemptionRepository`) and
 * Volunteer Transfer (`DrizzleVolunteerTransferRepository`) — both grant a
 * fresh `ministry_membership` row at the invitation's Access Level.
 */
export async function insertMinistryMembership({
  db,
  churchId,
  ministryId,
  volunteerId,
  ministryAccessLevel,
}: InsertMinistryMembershipInput): Promise<string> {
  const [membership] = await db
    .insert(ministryMembership)
    .values({ churchId, ministryId, volunteerId, ministryAccessLevel })
    .returning({ id: ministryMembership.id });
  if (!membership) throw new Error('Ministry membership insert failed');
  return membership.id;
}

export interface GrantMinistryMembershipRolesInput {
  db: AnyDrizzleDb;
  churchId: string;
  ministryMembershipId: string;
  roleIds: string[];
}

/** Grants the invitation's Role qualifications; a no-op for an empty list. */
export async function grantMinistryMembershipRoles({
  db,
  churchId,
  ministryMembershipId,
  roleIds,
}: GrantMinistryMembershipRolesInput): Promise<void> {
  if (roleIds.length === 0) return;
  await db
    .insert(ministryMembershipRole)
    .values(
      roleIds.map((roleId) => ({ churchId, ministryMembershipId, roleId })),
    )
    .onConflictDoNothing();
}
