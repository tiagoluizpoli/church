import { env } from '@church/env/server';
import { faker } from '@faker-js/faker';
import { SEED_CONFIG } from './constants';
import { generateAssignmentsAndAvailability } from './factories/assignment.factory';
// Factories
import { generateChurches } from './factories/church.factory';
import {
  generateMinistriesAndTeams,
  generateRoles,
} from './factories/ministry.factory';
import {
  generateEvents,
  generateSlotsAndRequirements,
} from './factories/scheduling.factory';
import { generateVolunteers } from './factories/volunteer.factory';
import { logStep, logSuccess, truncateAllTables } from './utils';

export async function seedDatabase() {
  logStep('Seeding data...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED);

  const churches = await generateChurches();
  const { ministries, teams } = await generateMinistriesAndTeams({ churches });
  const roles = await generateRoles(ministries);
  const { volunteers, links, qualifications } = await generateVolunteers({
    churches,
    ministries,
    teams,
    roles,
  });
  const { events, participations, blocks } = await generateEvents(
    ministries,
    roles,
  );
  const { requirements } = await generateSlotsAndRequirements(
    events,
    participations,
    blocks,
    roles,
  );

  await generateAssignmentsAndAvailability({
    volunteers,
    requirements,
    links,
    roles,
    events,
    participations,
    qualifications,
  });

  logSuccess('Database seeding complete.');
}

async function main() {
  const args = process.argv.slice(2);
  const isReset = args.includes('--reset');

  console.log('🌱 Starting modular database seeder...');

  if (env.NODE_ENV === 'production') {
    console.error('🚫 Cannot run seeder in production environment');
    process.exit(1);
  }

  try {
    if (isReset) {
      await truncateAllTables();
    }

    await seedDatabase();

    console.log('\n✨ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed:');
    console.error(error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
