import { faker } from '@faker-js/faker';
import { db } from '../../client';
import { type ChurchRecord, createChurch } from '../../tenancy';
import { SEED_CONFIG } from '../constants';
import { logStep, logSuccess } from '../utils';

export async function generateChurches(): Promise<ChurchRecord[]> {
  logStep('Generating churches...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED + 1);

  const churches = [
    { name: 'Grace Community', slug: 'grace-community' },
    { name: 'Hope City', slug: 'hope-city' },
    { name: 'First Baptist', slug: 'first-baptist' },
  ];

  const createdChurches: ChurchRecord[] = [];
  for (const church of churches) {
    createdChurches.push(
      await createChurch({
        db,
        id: faker.string.uuid(),
        name: church.name,
        slug: church.slug,
      }),
    );
  }

  const sortedChurches = [...createdChurches].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  logSuccess(`Generated ${sortedChurches.length} churches.`);
  return sortedChurches;
}
