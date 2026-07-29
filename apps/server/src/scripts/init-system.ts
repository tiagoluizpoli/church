import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addChurchMember,
  type ChurchRecord,
  createDb,
  findChurchBySlug,
  ministry,
  ministryVolunteer,
  user,
  volunteer,
} from '@church/db';
import { SeedDataSchema } from '@church/db/schemas/seed';
import { and, eq, type InferSelectModel, isNull } from 'drizzle-orm';
import { provisionSeedChurch } from './provision-seed-church';

const db = createDb();

interface RunInitSystemInput {
  seedPath: string;
}

export interface RunInitSystemResult {
  church: ChurchRecord;
  user: InferSelectModel<typeof user>;
  volunteer: InferSelectModel<typeof volunteer>;
  ministry: InferSelectModel<typeof ministry>;
}

export async function runInitSystem({
  seedPath,
}: RunInitSystemInput): Promise<RunInitSystemResult> {
  console.log('🚀 Initializing Church system...');

  const rawData = JSON.parse(readFileSync(seedPath, 'utf-8'));
  const seedData = SeedDataSchema.parse(rawData);

  console.log(
    `📍 Using seed data: ${seedData.churchName} (${seedData.churchSlug})`,
  );

  return await db.transaction(async (tx) => {
    // 1. Ensure Church exists — an `organization` row plus its extension row.
    let church = await findChurchBySlug({ db: tx, slug: seedData.churchSlug });

    if (!church) {
      console.log(`Creating church: ${seedData.churchName}`);
      church = await provisionSeedChurch({
        db: tx,
        churchName: seedData.churchName,
        churchSlug: seedData.churchSlug,
        adminEmail: seedData.adminEmail,
      });
    } else {
      console.log(`Church already exists: ${seedData.churchSlug}`);
    }

    // 2. Ensure User exists
    let adminUser = await tx.query.user.findFirst({
      where: eq(user.email, seedData.adminEmail),
    });

    if (!adminUser) {
      console.log(`Creating user: ${seedData.adminEmail}`);
      const [newUser] = await tx
        .insert(user)
        .values({
          id: crypto.randomUUID(),
          email: seedData.adminEmail,
          name: seedData.adminEmail.split('@')[0] ?? 'Admin',
          emailVerified: true,
        })
        .returning();

      if (!newUser) throw new Error('Failed to create user');
      adminUser = newUser;
    } else {
      console.log(`User already exists: ${seedData.adminEmail}`);
    }

    // 2b. Church Membership is what grants access to the Church, independently
    // of the Volunteer profile created below.
    await addChurchMember({
      db: tx,
      churchId: church.id,
      userId: adminUser.id,
      accessLevel: 'admin',
    });

    // 3. Ensure Volunteer exists for user
    let userVolunteer = await tx.query.volunteer.findFirst({
      where: and(
        eq(volunteer.userId, adminUser.id),
        eq(volunteer.churchId, church.id),
        isNull(volunteer.leftAt),
      ),
    });

    if (!userVolunteer) {
      console.log(`Creating volunteer for user: ${adminUser.email}`);
      const [newVolunteer] = await tx
        .insert(volunteer)
        .values({
          userId: adminUser.id,
          churchId: church.id,
          status: 'active',
        })
        .returning();

      if (!newVolunteer) throw new Error('Failed to create volunteer');
      userVolunteer = newVolunteer;
    }

    // 4. Ensure "Administration" ministry exists
    let adminMinistry = await tx.query.ministry.findFirst({
      where: and(
        eq(ministry.name, 'Administration'),
        eq(ministry.churchId, church.id),
      ),
    });

    if (!adminMinistry) {
      console.log('Creating "Administration" ministry');
      const [newMinistry] = await tx
        .insert(ministry)
        .values({
          name: 'Administration',
          churchId: church.id,
        })
        .returning();

      if (!newMinistry) throw new Error('Failed to create ministry');
      adminMinistry = newMinistry;
    }

    // 5. Link Volunteer to Ministry as LEADER
    const link = await tx.query.ministryVolunteer.findFirst({
      where: and(
        eq(ministryVolunteer.ministryId, adminMinistry.id),
        eq(ministryVolunteer.volunteerId, userVolunteer.id),
      ),
    });

    if (!link) {
      console.log('Promoting volunteer to LEADER of Administration');
      await tx.insert(ministryVolunteer).values({
        churchId: church.id,
        ministryId: adminMinistry.id,
        volunteerId: userVolunteer.id,
        ministryAccessLevel: 'leader',
      });
    }

    return {
      church,
      user: adminUser,
      volunteer: userVolunteer,
      ministry: adminMinistry,
    };
  });
}

if (import.meta.main) {
  const seedPath = join(process.cwd(), 'seed-data.json');
  runInitSystem({ seedPath })
    .then(() => {
      console.log('✅ System initialized successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Initialization failed:', error);
      process.exit(1);
    });
}
