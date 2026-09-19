import { faker } from '@faker-js/faker';
import { db } from '../../client';
import { type ChurchRecord, createChurch } from '../../tenancy';
import { SEED_CONFIG } from '../constants';
import { logStep, logSuccess } from '../utils';

interface SeedChurchDefinition {
  name: string;
  slug: string;
  timezone: string;
}

export async function generateChurches(): Promise<ChurchRecord[]> {
  logStep('Generating churches...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED + 1);

  // Distinct real IANA zones, not the UTC default: dev data must exercise
  // Church Timezone truth (ADR-0003), so spot-checking a seeded Event's
  // stored Instant against its church's zone is possible post-cutover.
  const churches: SeedChurchDefinition[] = [
    {
      name: 'Grace Community',
      slug: 'grace-community',
      timezone: 'America/New_York',
    },
    { name: 'Hope City', slug: 'hope-city', timezone: 'America/Sao_Paulo' },
    {
      name: 'First Baptist',
      slug: 'first-baptist',
      timezone: 'America/Los_Angeles',
    },
  ];

  const createdChurches: ChurchRecord[] = [];
  for (const church of churches) {
    createdChurches.push(
      await createChurch({
        db,
        id: faker.string.uuid(),
        name: church.name,
        slug: church.slug,
        timezone: church.timezone,
      }),
    );
  }

  const sortedChurches = [...createdChurches].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  logSuccess(`Generated ${sortedChurches.length} churches.`);
  return sortedChurches;
}
