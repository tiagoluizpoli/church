import { faker } from '@faker-js/faker';
import { hashPassword } from 'better-auth/crypto';
import { db } from '../../client';
import * as schema from '../../schema';
import type { ChurchRecord } from '../../tenancy';
import { SEED_CONFIG } from '../constants';
import { logStep, logSuccess } from '../utils';

const SEED_PASSWORD = 'dev-password-123';

/**
 * Qualified role ids keyed by membership id (`ministry_volunteer.id`).
 * Qualification hangs off the membership, not the volunteer, so a volunteer in
 * two ministries has two independent entries.
 */
export type SeededQualifications = Map<string, string[]>;

interface PickQualifiedRoleIdsInput {
  ministryRoles: (typeof schema.role.$inferSelect)[];
}

/**
 * Deliberately partial coverage. Qualifying everyone for everything would make
 * the filtering invisible — the candidate list would equal the roster and a
 * broken filter would look identical to a working one. Roughly one member in
 * seven is qualified for nothing, which is also the only way to exercise the
 * empty-candidate state.
 */
function pickQualifiedRoleIds({
  ministryRoles,
}: PickQualifiedRoleIdsInput): string[] {
  if (ministryRoles.length === 0) return [];

  const share = faker.number.int({ min: 1, max: 7 });
  if (share === 1) return [];

  const max = share <= 4 ? 1 : Math.min(3, ministryRoles.length);
  return faker.helpers
    .arrayElements(ministryRoles, { min: 1, max })
    .map((role) => role.id)
    .sort((a, b) => a.localeCompare(b));
}

interface GenerateVolunteersInput {
  churches: ChurchRecord[];
  ministries: (typeof schema.ministry.$inferSelect)[];
  teams: (typeof schema.team.$inferSelect)[];
  roles: (typeof schema.role.$inferSelect)[];
}

export async function generateVolunteers({
  churches,
  ministries,
  teams,
  roles,
}: GenerateVolunteersInput) {
  logStep('Generating volunteers...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED + 4);

  const usersData: (typeof schema.user.$inferInsert)[] = [];
  const volunteersData: (typeof schema.volunteer.$inferInsert)[] = [];
  // Church Membership is what grants access to a Church; volunteering is
  // additive to it. A seeded volunteer with no `member` row would be a person
  // with assignments and no way into the tenant.
  const membersData: (typeof schema.member.$inferInsert)[] = [];

  for (const church of churches) {
    for (let i = 0; i < SEED_CONFIG.VOLUNTEERS_PER_CHURCH; i++) {
      const userId = faker.string.uuid();
      const volunteerId = faker.string.uuid();
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();

      usersData.push({
        id: userId,
        name: `${firstName} ${lastName}`,
        email: faker.internet.email({ firstName, lastName }).toLowerCase(),
        emailVerified: true,
      });

      membersData.push({
        id: faker.string.uuid(),
        organizationId: church.id,
        userId,
      });

      volunteersData.push({
        id: volunteerId,
        userId: userId,
        churchId: church.id,
        status: 'active',
      });
    }
  }

  const insertedUsers = await db
    .insert(schema.user)
    .values(usersData)
    .returning();

  await db.insert(schema.member).values(membersData);

  const passwordHash = await hashPassword(SEED_PASSWORD);
  const accountsData: (typeof schema.account.$inferInsert)[] =
    insertedUsers.map((u) => ({
      id: faker.string.uuid(),
      accountId: u.id,
      providerId: 'credential',
      userId: u.id,
      password: passwordHash,
    }));
  await db.insert(schema.account).values(accountsData);

  const insertedVolunteers = await db
    .insert(schema.volunteer)
    .values(volunteersData)
    .returning();

  const sortedVolunteers = [...insertedVolunteers].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  const ministryVolunteersData: (typeof schema.ministryVolunteer.$inferInsert)[] =
    [];
  const ministryVolunteerTeamsData: (typeof schema.ministryVolunteerTeam.$inferInsert)[] =
    [];
  const ministryVolunteerRolesData: (typeof schema.ministryVolunteerRole.$inferInsert)[] =
    [];
  const qualifications: SeededQualifications = new Map();

  for (const v of sortedVolunteers) {
    const churchMinistries = ministries.filter(
      (m) => m.churchId === v.churchId,
    );
    const selectedMinistries = faker.helpers
      .arrayElements(churchMinistries, {
        min: 1,
        max: 2,
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const m of selectedMinistries) {
      const membershipId = faker.string.uuid();
      const ministryTeam = teams.find((t) => t.ministryId === m.id);
      ministryVolunteersData.push({
        id: membershipId,
        churchId: v.churchId,
        volunteerId: v.id,
        ministryId: m.id,
        ministryAccessLevel: 'volunteer',
        status: 'active',
      });
      if (ministryTeam) {
        ministryVolunteerTeamsData.push({
          churchId: v.churchId,
          ministryVolunteerId: membershipId,
          teamId: ministryTeam.id,
        });
      }

      const qualifiedRoleIds = pickQualifiedRoleIds({
        ministryRoles: roles.filter((r) => r.ministryId === m.id),
      });
      qualifications.set(membershipId, qualifiedRoleIds);
      for (const roleId of qualifiedRoleIds) {
        ministryVolunteerRolesData.push({
          churchId: v.churchId,
          ministryVolunteerId: membershipId,
          roleId,
        });
      }
    }
  }

  const insertedLinks = await db
    .insert(schema.ministryVolunteer)
    .values(ministryVolunteersData)
    .returning();

  if (ministryVolunteerTeamsData.length > 0) {
    await db
      .insert(schema.ministryVolunteerTeam)
      .values(ministryVolunteerTeamsData);
  }

  if (ministryVolunteerRolesData.length > 0) {
    await db
      .insert(schema.ministryVolunteerRole)
      .values(ministryVolunteerRolesData);
  }

  const sortedLinks = [...insertedLinks].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  logSuccess(
    `Generated ${insertedUsers.length} users (password: ${SEED_PASSWORD}) and linked ${sortedVolunteers.length} volunteers with ${ministryVolunteerRolesData.length} role qualifications.`,
  );
  return {
    users: insertedUsers,
    volunteers: sortedVolunteers,
    links: sortedLinks,
    qualifications,
  };
}
