import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '../index';
import * as schema from '../schema';
import { SeedDataSchema } from '../schemas/seed';

export async function runInitSystem(seedPath: string) {
  console.log('🚀 Initializing Church system...');

  const rawData = JSON.parse(readFileSync(seedPath, 'utf-8'));
  const seedData = SeedDataSchema.parse(rawData);

  console.log(
    `📍 Using seed data: ${seedData.churchName} (${seedData.churchSlug})`,
  );

  return await db.transaction(async (tx) => {
    // 1. Ensure Church exists
    let church = await tx.query.church.findFirst({
      where: eq(schema.church.slug, seedData.churchSlug),
    });

    if (!church) {
      console.log(`Creating church: ${seedData.churchName}`);
      const [newChurch] = await tx
        .insert(schema.church)
        .values({
          name: seedData.churchName,
          slug: seedData.churchSlug,
        })
        .returning();

      if (!newChurch) throw new Error('Failed to create church');
      church = newChurch;
    } else {
      console.log(`Church already exists: ${seedData.churchSlug}`);
    }

    // 2. Ensure User exists
    let user = await tx.query.user.findFirst({
      where: eq(schema.user.email, seedData.adminEmail),
    });

    if (!user) {
      console.log(`Creating user: ${seedData.adminEmail}`);
      const [newUser] = await tx
        .insert(schema.user)
        .values({
          id: crypto.randomUUID(),
          email: seedData.adminEmail,
          name: seedData.adminEmail.split('@')[0] ?? 'Admin',
          emailVerified: true,
        })
        .returning();

      if (!newUser) throw new Error('Failed to create user');
      user = newUser;
    } else {
      console.log(`User already exists: ${seedData.adminEmail}`);
    }

    // 3. Ensure Volunteer exists for user
    let volunteer = await tx.query.volunteer.findFirst({
      where: and(
        eq(schema.volunteer.userId, user.id),
        eq(schema.volunteer.churchId, church.id),
      ),
    });

    if (!volunteer) {
      console.log(`Creating volunteer for user: ${user.email}`);
      const [newVolunteer] = await tx
        .insert(schema.volunteer)
        .values({
          userId: user.id,
          churchId: church.id,
          status: 'active',
        })
        .returning();

      if (!newVolunteer) throw new Error('Failed to create volunteer');
      volunteer = newVolunteer;
    }

    // 4. Ensure "Administration" ministry exists
    let ministry = await tx.query.ministry.findFirst({
      where: and(
        eq(schema.ministry.name, 'Administration'),
        eq(schema.ministry.churchId, church.id),
      ),
    });

    if (!ministry) {
      console.log('Creating "Administration" ministry');
      const [newMinistry] = await tx
        .insert(schema.ministry)
        .values({
          name: 'Administration',
          churchId: church.id,
        })
        .returning();

      if (!newMinistry) throw new Error('Failed to create ministry');
      ministry = newMinistry;
    }

    // 5. Link Volunteer to Ministry as LEADER
    const link = await tx.query.ministryVolunteer.findFirst({
      where: and(
        eq(schema.ministryVolunteer.ministryId, ministry.id),
        eq(schema.ministryVolunteer.volunteerId, volunteer.id),
      ),
    });

    if (!link) {
      console.log('Promoting volunteer to LEADER of Administration');
      await tx.insert(schema.ministryVolunteer).values({
        churchId: church.id,
        ministryId: ministry.id,
        volunteerId: volunteer.id,
        systemRole: 'leader',
      });
    }

    return { church, user, volunteer, ministry };
  });
}

if (import.meta.main) {
  const seedPath = join(process.cwd(), 'seed-data.json');
  runInitSystem(seedPath)
    .then(() => {
      console.log('✅ System initialized successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Initialization failed:', error);
      process.exit(1);
    });
}
