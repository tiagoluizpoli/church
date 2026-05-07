import { faker } from '@faker-js/faker';
import { db } from '../../client';
import * as schema from '../../schema';
import { SEED_CONFIG } from '../constants';
import { logStep, logSuccess } from '../utils';

export async function generateMinistriesAndTeams(
  churches: (typeof schema.church.$inferSelect)[],
) {
  logStep('Generating ministries and teams...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED + 2);

  const ministriesData: (typeof schema.ministry.$inferInsert)[] = [];

  for (const church of churches) {
    for (const mName of SEED_CONFIG.MINISTRIES_PER_CHURCH) {
      ministriesData.push({
        id: faker.string.uuid(),
        churchId: church.id,
        name: mName,
        description: `Standard ${mName} ministry for ${church.name}`,
        enforcementType: 'soft',
      });
    }
  }

  const insertedMinistries = await db
    .insert(schema.ministry)
    .values(ministriesData)
    .returning();

  const sortedMinistries = [...insertedMinistries].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  const teamsData: (typeof schema.team.$inferInsert)[] = [];
  for (const m of sortedMinistries) {
    teamsData.push({
      id: faker.string.uuid(),
      churchId: m.churchId,
      ministryId: m.id,
      name: 'Main Team',
    });
  }

  const insertedTeams = await db
    .insert(schema.team)
    .values(teamsData)
    .returning();

  const sortedTeams = [...insertedTeams].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  logSuccess(
    `Generated ${sortedMinistries.length} ministries and ${sortedTeams.length} teams.`,
  );
  return { ministries: sortedMinistries, teams: sortedTeams };
}

export async function generateRoles(
  ministries: (typeof schema.ministry.$inferSelect)[],
) {
  logStep('Generating roles...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED + 3);

  const rolesData: (typeof schema.role.$inferInsert)[] = [];

  for (const m of ministries) {
    const roles = SEED_CONFIG.MINISTRY_ROLES[m.name] || ['Volunteer'];
    for (const rName of roles) {
      rolesData.push({
        id: faker.string.uuid(),
        churchId: m.churchId,
        ministryId: m.id,
        name: rName,
        isGlobal: false,
      });
    }
  }

  const insertedRoles = await db
    .insert(schema.role)
    .values(rolesData)
    .returning();

  const sortedRoles = [...insertedRoles].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  logSuccess(`Generated ${sortedRoles.length} roles.`);
  return sortedRoles;
}
