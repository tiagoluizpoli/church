import { ministryVolunteer, ministryVolunteerRole } from '@church/db';
import { eq } from 'drizzle-orm';
import { testDb } from '../integration/repositories/setup';

export interface VolunteerIdInput {
  volunteerId: string;
}

/** The Role ids a Volunteer is qualified for, across Ministries, sorted. */
export async function qualifiedRoleIds({
  volunteerId,
}: VolunteerIdInput): Promise<string[]> {
  const rows = await testDb
    .select({ roleId: ministryVolunteerRole.roleId })
    .from(ministryVolunteerRole)
    .innerJoin(
      ministryVolunteer,
      eq(ministryVolunteer.id, ministryVolunteerRole.ministryVolunteerId),
    )
    .where(eq(ministryVolunteer.volunteerId, volunteerId));
  return rows.map((row) => row.roleId).sort();
}
