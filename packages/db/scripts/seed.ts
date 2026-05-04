import { db } from '../src';
import { church } from '../src/schema';

async function main() {
  console.log('Seeding database...');

  const [insertedChurch] = await db
    .insert(church)
    .values({
      name: 'Central Church',
      slug: 'central-church',
      settings: {
        timezone: 'UTC',
      },
    })
    .onConflictDoUpdate({
      target: church.slug,
      set: { name: 'Central Church' },
    })
    .returning();

  if (!insertedChurch) {
    throw new Error('Failed to insert church');
  }

  console.log(`Seeded church: ${insertedChurch.name} (${insertedChurch.id})`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Seeding failed:');
  console.error(err);
  process.exit(1);
});
