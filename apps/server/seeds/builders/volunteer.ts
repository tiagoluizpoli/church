import {
  ministryVolunteer,
  ministryVolunteerRole,
  ministryVolunteerTeam,
  volunteer,
} from '@church/db';
import type { SeedWriter } from '../recipe';
import { requireInsertedRow } from './require-inserted-row';

export type SeededVolunteer = typeof volunteer.$inferSelect;
export type SeededMinistryMembership = typeof ministryVolunteer.$inferSelect;
export type MinistryAccessLevel =
  SeededMinistryMembership['ministryAccessLevel'];
export type TeamAccessLevel =
  (typeof ministryVolunteerTeam.$inferSelect)['accessLevel'];

export interface BuildVolunteerInput {
  db: SeedWriter;
  churchId: string;
  userId: string;
  id: string;
}

/** The User's one active Volunteer profile, in `churchId`. */
export async function buildVolunteer({
  db,
  churchId,
  userId,
  id,
}: BuildVolunteerInput): Promise<SeededVolunteer> {
  return requireInsertedRow({
    rows: await db
      .insert(volunteer)
      .values({ id, churchId, userId, status: 'active' })
      .returning(),
    description: `Volunteer for User ${userId}`,
  });
}

export interface SeedTeamMembership {
  teamId: string;
  accessLevel: TeamAccessLevel;
}

export interface BuildMinistryMembershipInput {
  db: SeedWriter;
  churchId: string;
  volunteerId: string;
  ministryId: string;
  id: string;
  ministryAccessLevel: MinistryAccessLevel;
  /** Role qualifications — explicit grants; membership alone qualifies for nothing. */
  roleIds: string[];
  teams: SeedTeamMembership[];
}

/** A Ministry Membership with its Role qualifications and Team Memberships. */
export async function buildMinistryMembership({
  db,
  churchId,
  volunteerId,
  ministryId,
  id,
  ministryAccessLevel,
  roleIds,
  teams,
}: BuildMinistryMembershipInput): Promise<SeededMinistryMembership> {
  const membership = requireInsertedRow({
    rows: await db
      .insert(ministryVolunteer)
      .values({
        id,
        churchId,
        volunteerId,
        ministryId,
        ministryAccessLevel,
        status: 'active',
      })
      .returning(),
    description: `Ministry Membership ${id}`,
  });

  if (roleIds.length > 0) {
    await db.insert(ministryVolunteerRole).values(
      roleIds.map((roleId) => ({
        churchId,
        ministryVolunteerId: membership.id,
        roleId,
      })),
    );
  }

  if (teams.length > 0) {
    await db.insert(ministryVolunteerTeam).values(
      teams.map((teamMembership) => ({
        churchId,
        ministryVolunteerId: membership.id,
        teamId: teamMembership.teamId,
        accessLevel: teamMembership.accessLevel,
      })),
    );
  }

  return membership;
}
