import {
  ministryVolunteer,
  ministryVolunteerRole,
  ministryVolunteerTeam,
  volunteer,
} from '@church/db';
import { type Instant, toDate } from '@church/time';
import type { SeedWriter } from '../recipe';
import { deriveSeedId } from './derived-id';
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
  id?: string;
  /** Set to retire the profile: it keeps its Church but stops being active. */
  leftAt?: Instant;
}

/** The User's Volunteer profile in `churchId`: active unless `leftAt` retires it. */
export async function buildVolunteer({
  db,
  churchId,
  userId,
  id,
  leftAt,
}: BuildVolunteerInput): Promise<SeededVolunteer> {
  return requireInsertedRow({
    rows: await db
      .insert(volunteer)
      .values({
        id,
        churchId,
        userId,
        status: 'active',
        leftAt: leftAt === undefined ? undefined : toDate({ instant: leftAt }),
      })
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
  id?: string;
  ministryAccessLevel: MinistryAccessLevel;
  /** Active unless a fixture needs an inactive Ministry Membership. */
  status?: SeededMinistryMembership['status'];
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
  status = 'active',
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
        status,
      })
      .returning(),
    description: `Ministry Membership ${id}`,
  });

  if (roleIds.length > 0) {
    await db.insert(ministryVolunteerRole).values(
      roleIds.map((roleId) => ({
        id: deriveSeedId({
          kind: 'ministry-volunteer-role',
          parentIds: [membership.id, roleId],
        }),
        churchId,
        ministryVolunteerId: membership.id,
        roleId,
      })),
    );
  }

  if (teams.length > 0) {
    await db.insert(ministryVolunteerTeam).values(
      teams.map((teamMembership) => ({
        id: deriveSeedId({
          kind: 'ministry-volunteer-team',
          parentIds: [membership.id, teamMembership.teamId],
        }),
        churchId,
        ministryVolunteerId: membership.id,
        teamId: teamMembership.teamId,
        accessLevel: teamMembership.accessLevel,
      })),
    );
  }

  return membership;
}

export type SeededRoleQualification = typeof ministryVolunteerRole.$inferSelect;
export type SeededTeamMembership = typeof ministryVolunteerTeam.$inferSelect;

export interface BuildRoleQualificationInput {
  db: SeedWriter;
  churchId: string;
  ministryVolunteerId: string;
  roleId: string;
}

/** One explicit Role qualification added to an existing Ministry Membership. */
export async function buildRoleQualification({
  db,
  churchId,
  ministryVolunteerId,
  roleId,
}: BuildRoleQualificationInput): Promise<SeededRoleQualification> {
  return requireInsertedRow({
    rows: await db
      .insert(ministryVolunteerRole)
      .values({
        id: deriveSeedId({
          kind: 'ministry-volunteer-role',
          parentIds: [ministryVolunteerId, roleId],
        }),
        churchId,
        ministryVolunteerId,
        roleId,
      })
      .returning(),
    description: `Role qualification ${roleId}`,
  });
}

export interface BuildTeamMembershipInput {
  db: SeedWriter;
  churchId: string;
  ministryVolunteerId: string;
  teamId: string;
  accessLevel: TeamAccessLevel;
}

/** One Team Membership added to an existing Ministry Membership. */
export async function buildTeamMembership({
  db,
  churchId,
  ministryVolunteerId,
  teamId,
  accessLevel,
}: BuildTeamMembershipInput): Promise<SeededTeamMembership> {
  return requireInsertedRow({
    rows: await db
      .insert(ministryVolunteerTeam)
      .values({
        id: deriveSeedId({
          kind: 'ministry-volunteer-team',
          parentIds: [ministryVolunteerId, teamId],
        }),
        churchId,
        ministryVolunteerId,
        teamId,
        accessLevel,
      })
      .returning(),
    description: `Team Membership ${teamId}`,
  });
}
