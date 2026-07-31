import 'reflect-metadata';
import * as schema from '@church/db';
import { addChurchMember, createChurch, user } from '@church/db';
import { getTestDatabaseUrl } from '@church/db/test-database-url';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbActiveChurchResolver } from '../../../src/application/db-active-church-resolver';
import { ChurchId, UserId } from '../../../src/domain/branded-ids';
import { DrizzleAuthorityActorResolver } from '../../../src/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '../../../src/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleChurchRepository } from '../../../src/infrastructure/repositories/drizzle-church.repository';
import { DrizzleUnitOfWork } from '../../../src/infrastructure/repositories/drizzle-unit-of-work';

const DATABASE_URL = getTestDatabaseUrl();
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const testDb = drizzle(pool, { schema });

const churchAId = ChurchId.from('11111111-1111-4111-8111-c11111111111');
const churchBId = ChurchId.from('11111111-1111-4111-8111-c11111111112');
const singleMemberUserId = UserId.from('active-resolver-single-user');
const dualMemberUserId = UserId.from('active-resolver-dual-user');
const strandedUserId = UserId.from('active-resolver-stranded-user');
const removedSingleRemainUserId = UserId.from(
  'active-resolver-removed-single-remain',
);
const removedNoneRemainUserId = UserId.from(
  'active-resolver-removed-none-remain',
);

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
      id: singleMemberUserId,
      name: 'Active Resolver Single',
      email: 'active-resolver-single@test.com',
      emailVerified: true,
    },
    {
      id: dualMemberUserId,
      name: 'Active Resolver Dual',
      email: 'active-resolver-dual@test.com',
      emailVerified: true,
    },
    {
      id: strandedUserId,
      name: 'Active Resolver Stranded',
      email: 'active-resolver-stranded@test.com',
      emailVerified: true,
    },
    {
      id: removedSingleRemainUserId,
      name: 'Active Resolver Removed Single Remain',
      email: 'active-resolver-removed-single-remain@test.com',
      emailVerified: true,
    },
    {
      id: removedNoneRemainUserId,
      name: 'Active Resolver Removed None Remain',
      email: 'active-resolver-removed-none-remain@test.com',
      emailVerified: true,
    },
  ]);

  await createChurch({
    db: testDb,
    id: churchAId,
    name: 'Active Resolver Church A',
    slug: 'active-resolver-church-a',
    timezone: 'UTC',
  });
  await createChurch({
    db: testDb,
    id: churchBId,
    name: 'Active Resolver Church B',
    slug: 'active-resolver-church-b',
    timezone: 'UTC',
  });

  await addChurchMember({
    db: testDb,
    churchId: churchAId,
    userId: singleMemberUserId,
    accessLevel: 'member',
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
  // strandedUserId deliberately gets no Church Membership row.

  await addChurchMember({
    db: testDb,
    churchId: churchBId,
    userId: removedSingleRemainUserId,
    accessLevel: 'member',
  });
  // removedSingleRemainUserId deliberately gets no Membership row in churchA —
  // simulates a session still naming churchA as active after that Membership
  // was removed, with exactly one Membership (churchB) remaining.

  // removedNoneRemainUserId deliberately gets no Membership row anywhere —
  // simulates a session naming churchA as active after that Membership was
  // removed, with no Membership remaining at all.
}

function createResolver(): DbActiveChurchResolver {
  return new DbActiveChurchResolver(
    new DrizzleAuthorityActorResolver({ db: testDb }),
    new DrizzleChurchMembershipRepository({ db: testDb }),
    new DrizzleChurchRepository({ db: testDb }),
    new DrizzleUnitOfWork({ db: testDb }),
  );
}

describe('DbActiveChurchResolver (integration, real repeatable-read transaction)', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('auto-selects the one Church for a User with exactly one Membership, through a real transaction', async () => {
    const resolver = createResolver();

    const result = await resolver.resolve({
      userId: singleMemberUserId,
      activeOrganizationId: null,
    });

    expect(result).toEqual({
      status: 'resolved',
      churchId: churchAId,
      volunteerId: null,
      autoSelected: true,
    });
  });

  it('requires selection for a User with several Memberships and no active organization', async () => {
    const resolver = createResolver();

    const result = await resolver.resolve({
      userId: dualMemberUserId,
      activeOrganizationId: null,
    });

    expect(result).toEqual({ status: 'selection_required' });
  });

  it('resolves directly against a session-provided active organization without touching the membership list', async () => {
    const resolver = createResolver();

    const result = await resolver.resolve({
      userId: dualMemberUserId,
      activeOrganizationId: churchBId,
    });

    expect(result).toEqual({
      status: 'resolved',
      churchId: churchBId,
      volunteerId: null,
      autoSelected: false,
    });
  });

  it('denies a User with no Church Membership at all', async () => {
    const resolver = createResolver();

    const result = await resolver.resolve({
      userId: strandedUserId,
      activeOrganizationId: null,
    });

    expect(result).toEqual({ status: 'no_membership' });
  });

  it('auto-selects the one remaining Church and reports the former Church name when the session names a Church whose Membership was removed', async () => {
    const resolver = createResolver();

    const result = await resolver.resolve({
      userId: removedSingleRemainUserId,
      activeOrganizationId: churchAId,
    });

    expect(result).toEqual({
      status: 'resolved',
      churchId: churchBId,
      volunteerId: null,
      autoSelected: true,
      membershipRemovedFrom: 'Active Resolver Church A',
    });
  });

  it('denies and reports the former Church name when the session names a Church whose Membership was removed and none remain', async () => {
    const resolver = createResolver();

    const result = await resolver.resolve({
      userId: removedNoneRemainUserId,
      activeOrganizationId: churchAId,
    });

    expect(result).toEqual({
      status: 'no_membership',
      membershipRemovedFrom: 'Active Resolver Church A',
    });
  });
});
