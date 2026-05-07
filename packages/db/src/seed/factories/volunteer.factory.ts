import { faker } from '@faker-js/faker';
import { db } from '../../client';
import * as schema from '../../schema';
import { SEED_CONFIG } from '../constants';
import { logStep, logSuccess } from '../utils';

export async function generateVolunteers(
  churches: (typeof schema.church.$inferSelect)[],
  ministries: (typeof schema.ministry.$inferSelect)[],
  teams: (typeof schema.team.$inferSelect)[],
) {
  logStep('Generating volunteers...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED + 4);

  const usersData: (typeof schema.user.$inferInsert)[] = [];
  const volunteersData: (typeof schema.volunteer.$inferInsert)[] = [];

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
  const insertedVolunteers = await db
    .insert(schema.volunteer)
    .values(volunteersData)
    .returning();

  const sortedVolunteers = [...insertedVolunteers].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  const ministryVolunteersData: (typeof schema.ministryVolunteer.$inferInsert)[] =
    [];

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
      const ministryTeam = teams.find((t) => t.ministryId === m.id);
      ministryVolunteersData.push({
        id: faker.string.uuid(),
        churchId: v.churchId,
        volunteerId: v.id,
        ministryId: m.id,
        teamId: ministryTeam?.id,
        systemRole: 'volunteer',
        status: 'active',
      });
    }
  }

  const insertedLinks = await db
    .insert(schema.ministryVolunteer)
    .values(ministryVolunteersData)
    .returning();

  const sortedLinks = [...insertedLinks].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  logSuccess(
    `Generated ${insertedUsers.length} users and linked ${sortedVolunteers.length} volunteers.`,
  );
  return {
    users: insertedUsers,
    volunteers: sortedVolunteers,
    links: sortedLinks,
  };
}
