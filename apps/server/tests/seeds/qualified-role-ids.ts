import { ministryMembership, ministryMembershipRole } from '@church/db';
import { eq } from 'drizzle-orm';
import { testDb } from '@/tests/integration/repositories/setup';

export interface VolunteerIdInput {
  volunteerId: string;
}

/** The Role ids a Volunteer is qualified for, across Ministries, sorted. */
export async function qualifiedRoleIds({
  volunteerId,
}: VolunteerIdInput): Promise<string[]> {
  const rows = await testDb
    .select({ roleId: ministryMembershipRole.roleId })
    .from(ministryMembershipRole)
    .innerJoin(
      ministryMembership,
      eq(ministryMembership.id, ministryMembershipRole.ministryMembershipId),
    )
    .where(eq(ministryMembership.volunteerId, volunteerId));
  return rows.map((row) => row.roleId).sort();
}
