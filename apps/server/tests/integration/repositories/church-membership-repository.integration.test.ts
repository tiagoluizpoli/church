import * as schema from '@church/db';
import { addChurchMember, createChurch, user } from '@church/db';
import { getTestDatabaseUrl } from '@church/db/test-database-url';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, UserId } from '../../../src/domain/branded-ids';
import { DrizzleChurchMembershipRepository } from '../../../src/infrastructure/auth/drizzle-church-membership-repository';

const DATABASE_URL = getTestDatabaseUrl();
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const testDb = drizzle(pool, { schema });

const churchAId = ChurchId.from('11111111-1111-4111-8111-b11111111111');
const churchBId = ChurchId.from('11111111-1111-4111-8111-b11111111112');
const dualMemberUserId = UserId.from('membership-dual-user');
const singleMemberUserId = UserId.from('membership-single-user');
const strandedUserId = UserId.from('membership-stranded-user');

// Roots at `organization`/`user`: see the note on `truncateAll` in
// `tests/integration/repositories/setup.ts`.
async function resetDb(): Promise<void> {
  await testDb.execute(`
    TRUNCATE TABLE organization, "user" RESTART IDENTITY CASCADE
  `);
}

async function seed(): Promise<void> {
  await testDb.insert(user).values([
    {
      id: dualMemberUserId,
      name: 'Membership Dual',
      email: 'membership-dual@test.com',
      emailVerified: true,
    },
    {
      id: singleMemberUserId,
      name: 'Membership Single',
      email: 'membership-single@test.com',
      emailVerified: true,
    },
    {
      id: strandedUserId,
      name: 'Membership Stranded',
      email: 'membership-stranded@test.com',
      emailVerified: true,
    },
  ]);

  await createChurch({
    db: testDb,
    id: churchAId,
    name: 'Membership Church A',
    slug: 'membership-church-a',
    timezone: 'UTC',
  });
  await createChurch({
    db: testDb,
    id: churchBId,
    name: 'Membership Church B',
    slug: 'membership-church-b',
    timezone: 'UTC',
  });

  await addChurchMember({
    db: testDb,
    churchId: churchAId,
    userId: dualMemberUserId,
    accessLevel: 'member',
  });
  await addChurchMember({
    db: testDb,
    churchId: churchBId,
    userId: dualMemberUserId,
    accessLevel: 'admin',
  });
  await addChurchMember({
    db: testDb,
    churchId: churchAId,
    userId: singleMemberUserId,
    accessLevel: 'member',
  });
  // strandedUserId deliberately gets no Church Membership row.
}

describe('DrizzleChurchMembershipRepository (integration)', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('lists every Church Membership a User holds, each with its own Access Level', async () => {
    const repository = new DrizzleChurchMembershipRepository({ db: testDb });

    const memberships = await repository.listByUserId({
      userId: dualMemberUserId,
    });

    expect(memberships).toHaveLength(2);
    expect(memberships).toEqual(
      expect.arrayContaining([
        { churchId: churchAId, accessLevel: 'member' },
        { churchId: churchBId, accessLevel: 'admin' },
      ]),
    );
  });

  it('lists a single Church Membership for a User who belongs to exactly one Church', async () => {
    const repository = new DrizzleChurchMembershipRepository({ db: testDb });

    const memberships = await repository.listByUserId({
      userId: singleMemberUserId,
    });

    expect(memberships).toEqual([
      { churchId: churchAId, accessLevel: 'member' },
    ]);
  });

  it('returns an empty list for a User with no Church Membership', async () => {
    const repository = new DrizzleChurchMembershipRepository({ db: testDb });

    const memberships = await repository.listByUserId({
      userId: strandedUserId,
    });

    expect(memberships).toEqual([]);
  });

  it('lists comparison facts — identity, timezone and Access Level — for every Church Membership', async () => {
    const repository = new DrizzleChurchMembershipRepository({ db: testDb });

    const comparisons = await repository.listComparisonsByUserId({
      userId: dualMemberUserId,
    });

    expect(comparisons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          churchId: churchAId,
          accessLevel: 'member',
          churchName: 'Membership Church A',
          timezone: 'UTC',
          lastOpenedAt: null,
        }),
        expect.objectContaining({
          churchId: churchBId,
          accessLevel: 'admin',
          churchName: 'Membership Church B',
          timezone: 'UTC',
          lastOpenedAt: null,
        }),
      ]),
    );
  });

  it('records when a Church was opened, scoped to the (user, Church) pair', async () => {
    const repository = new DrizzleChurchMembershipRepository({ db: testDb });

    await repository.touchOpened({
      userId: dualMemberUserId,
      churchId: churchAId,
    });
    const comparisons = await repository.listComparisonsByUserId({
      userId: dualMemberUserId,
    });

    const churchA = comparisons.find((row) => row.churchId === churchAId);
    const churchB = comparisons.find((row) => row.churchId === churchBId);
    expect(churchA?.lastOpenedAt).toBeInstanceOf(Date);
    expect(churchB?.lastOpenedAt).toBeNull();
  });
});
