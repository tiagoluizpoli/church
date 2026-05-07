import { faker } from '@faker-js/faker';
import { db } from '../../client';
import * as schema from '../../schema';
import { SEED_CONFIG } from '../constants';
import { logStep, logSuccess } from '../utils';

export async function generateChurches() {
  logStep('Generating churches...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED + 1);

  const churches = [
    { name: 'Grace Community', slug: 'grace-community' },
    { name: 'Hope City', slug: 'hope-city' },
    { name: 'First Baptist', slug: 'first-baptist' },
  ];

  const insertedChurches = await db
    .insert(schema.church)
    .values(
      churches.map((c) => ({
        id: faker.string.uuid(),
        name: c.name,
        slug: c.slug,
        settings: {},
      })),
    )
    .returning();

  const sortedChurches = [...insertedChurches].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  logSuccess(`Generated ${sortedChurches.length} churches.`);
  return sortedChurches;
}
