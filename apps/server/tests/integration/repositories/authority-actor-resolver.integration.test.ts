import * as schema from '@church/db';
import {
  addChurchMember,
  createChurch,
  ministry,
  ministryVolunteer,
  ministryVolunteerRole,
  ministryVolunteerTeam,
  role,
  team,
  user,
  volunteer,
} from '@church/db';
import { getTestDatabaseUrl } from '@church/db/test-database-url';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthorityService } from '../../../src/domain/authority/authority-service';
import type { AuthorityResource } from '../../../src/domain/authority/types';
import {
  ChurchId,
  MinistryId,
  RoleId,
  TeamId,
  UserId,
  VolunteerId,
} from '../../../src/domain/branded-ids';
import { DrizzleAuthorityActorResolver } from '../../../src/infrastructure/auth/drizzle-authority-actor-resolver';

const DATABASE_URL = getTestDatabaseUrl();
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const testDb = drizzle(pool, { schema });

const churchId = ChurchId.from('11111111-1111-4111-8111-a11111111111');
const adminUserId = UserId.from('authority-admin-user');
const leaderUserId = UserId.from('authority-leader-user');
const volunteerUserId = UserId.from('authority-volunteer-user');
const ministryId = MinistryId.from('33333333-3333-4333-8333-a33333333331');
const teamId = TeamId.from('55555555-5555-4555-8555-a55555555551');
const roleId = RoleId.from('66666666-6666-4666-8666-a66666666661');
const leaderVolunteerId = VolunteerId.from(
  '44444444-4444-4444-8444-a44444444441',
);
const memberVolunteerId = VolunteerId.from(
  '44444444-4444-4444-8444-a44444444442',
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
      id: adminUserId,
      name: 'Authority Admin',
      email: 'authority-admin@test.com',
      emailVerified: true,
    },
    {
      id: leaderUserId,
      name: 'Authority Leader',
      email: 'authority-leader@test.com',
      emailVerified: true,
    },
    {
      id: volunteerUserId,
      name: 'Authority Volunteer',
      email: 'authority-volunteer@test.com',
      emailVerified: true,
    },
  ]);

  await createChurch({
    db: testDb,
    id: churchId,
    name: 'Authority Church',
    slug: 'authority-church',
    timezone: 'UTC',
  });

  await addChurchMember({
    db: testDb,
    churchId,
    userId: adminUserId,
    accessLevel: 'admin',
  });
  await addChurchMember({
    db: testDb,
    churchId,
    userId: leaderUserId,
    accessLevel: 'member',
  });
  await addChurchMember({
    db: testDb,
    churchId,
    userId: volunteerUserId,
    accessLevel: 'member',
  });

  await testDb
    .insert(ministry)
    .values({ id: ministryId, churchId, name: 'Authority Ministry' });
  await testDb
    .insert(team)
    .values({ id: teamId, churchId, ministryId, name: 'Authority Team' });
  await testDb
    .insert(role)
    .values({ id: roleId, churchId, ministryId, name: 'Authority Role' });

  await testDb.insert(volunteer).values([
    {
      id: leaderVolunteerId,
      churchId,
      userId: leaderUserId,
      status: 'active',
    },
    {
      id: memberVolunteerId,
      churchId,
      userId: volunteerUserId,
      status: 'active',
    },
  ]);

  const [leaderMembership, memberMembership] = await testDb
    .insert(ministryVolunteer)
    .values([
      {
        churchId,
        ministryId,
        volunteerId: leaderVolunteerId,
        ministryAccessLevel: 'leader',
        status: 'active',
      },
      {
        churchId,
        ministryId,
        volunteerId: memberVolunteerId,
        ministryAccessLevel: 'volunteer',
        status: 'active',
      },
    ])
    .returning();

  if (!leaderMembership || !memberMembership) {
    throw new Error('Authority actor resolver seed failed');
  }

  await testDb.insert(ministryVolunteerTeam).values([
    {
      churchId,
      ministryVolunteerId: leaderMembership.id,
      teamId,
      accessLevel: 'leader',
    },
    {
      churchId,
      ministryVolunteerId: memberMembership.id,
      teamId,
      accessLevel: 'member',
    },
  ]);

  await testDb.insert(ministryVolunteerRole).values({
    churchId,
    ministryVolunteerId: memberMembership.id,
    roleId,
  });
}

describe('DrizzleAuthorityActorResolver + AuthorityService (integration)', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('resolves a Church Membership admin with no Volunteer profile, allowed to manage the Church but not participate anywhere', async () => {
    const resolver = new DrizzleAuthorityActorResolver(testDb);
    const actor = await resolver.resolveActor({
      userId: adminUserId,
      activeChurchId: churchId,
    });

    expect(actor.volunteerId).toBeNull();
    expect(actor.churchMembership).toEqual({ churchId, accessLevel: 'admin' });
    expect(actor.ministryMemberships).toEqual([]);
    expect(actor.teamMemberships).toEqual([]);

    const churchResource: AuthorityResource = { type: 'church', churchId };
    const manage = AuthorityService.authorize({
      actor,
      action: 'manage',
      resource: churchResource,
    });
    const participate = AuthorityService.authorize({
      actor,
      action: 'participate',
      resource: { type: 'ministry', churchId, ministryId },
    });

    expect(manage).toEqual({ allowed: true });
    expect(participate).toEqual({
      allowed: false,
      reason: 'INSUFFICIENT_ACCESS_LEVEL',
    });
  });

  it('resolves a TeamLeader end to end, allowed to manage their Team', async () => {
    const resolver = new DrizzleAuthorityActorResolver(testDb);
    const actor = await resolver.resolveActor({
      userId: leaderUserId,
      activeChurchId: churchId,
    });

    expect(actor.volunteerId).toBe(leaderVolunteerId);
    expect(actor.ministryMemberships).toEqual([
      {
        churchId,
        ministryId,
        accessLevel: 'leader',
        qualifiedRoleIds: [],
      },
    ]);
    expect(actor.teamMemberships).toEqual([
      { churchId, ministryId, teamId, accessLevel: 'leader' },
    ]);

    const decision = AuthorityService.authorize({
      actor,
      action: 'manage',
      resource: { type: 'team', churchId, ministryId, teamId },
    });

    expect(decision).toEqual({ allowed: true });
  });

  it("resolves a rank-and-file volunteer's own Role qualification and lets them participate in their own resource only", async () => {
    const resolver = new DrizzleAuthorityActorResolver(testDb);
    const actor = await resolver.resolveActor({
      userId: volunteerUserId,
      activeChurchId: churchId,
    });

    expect(actor.volunteerId).toBe(memberVolunteerId);
    expect(actor.ministryMemberships).toEqual([
      {
        churchId,
        ministryId,
        accessLevel: 'volunteer',
        qualifiedRoleIds: [roleId],
      },
    ]);

    const ownResource: AuthorityResource = {
      type: 'ministry',
      churchId,
      ministryId,
      ownerVolunteerId: memberVolunteerId,
    };
    const someoneElsesResource: AuthorityResource = {
      type: 'ministry',
      churchId,
      ministryId,
      ownerVolunteerId: leaderVolunteerId,
    };

    expect(
      AuthorityService.authorize({
        actor,
        action: 'participate',
        resource: ownResource,
      }),
    ).toEqual({ allowed: true });
    expect(
      AuthorityService.authorize({
        actor,
        action: 'participate',
        resource: someoneElsesResource,
      }),
    ).toEqual({ allowed: false, reason: 'INSUFFICIENT_ACCESS_LEVEL' });
  });
});
