import * as schema from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { parseInstant } from '@church/time';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildChurch,
  buildChurchMembership,
} from '../../../seeds/builders/church';
import { buildUser } from '../../../seeds/builders/identity';
import {
  buildMinistry,
  buildRole,
  buildTeam,
} from '../../../seeds/builders/ministry';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '../../../seeds/builders/volunteer';
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

const DATABASE_URL = getIntegrationDatabaseUrl();
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const testDb = drizzle(pool, { schema });

const churchId = ChurchId.from('11111111-1111-4111-8111-a11111111111');
const adminUserId = UserId.from('authority-admin-user');
const leaderUserId = UserId.from('authority-leader-user');
const volunteerUserId = UserId.from('authority-volunteer-user');
const strandedUserId = UserId.from('authority-stranded-user');
const retiredUserId = UserId.from('authority-retired-user');
const ministryId = MinistryId.from('33333333-3333-4333-8333-a33333333331');
const teamId = TeamId.from('55555555-5555-4555-8555-a55555555551');
const roleId = RoleId.from('66666666-6666-4666-8666-a66666666661');
const leaderVolunteerId = VolunteerId.from(
  '44444444-4444-4444-8444-a44444444441',
);
const memberVolunteerId = VolunteerId.from(
  '44444444-4444-4444-8444-a44444444442',
);
const retiredVolunteerId = VolunteerId.from(
  '44444444-4444-4444-8444-a44444444443',
);

// Roots at `organization`/`user`: see the note on `truncateAll` in
// `tests/integration/repositories/setup.ts`.
async function resetDb(): Promise<void> {
  await testDb.execute(`
    TRUNCATE TABLE organization, "user" RESTART IDENTITY CASCADE
  `);
}

async function seed(): Promise<void> {
  await buildUser({
    db: testDb,
    id: adminUserId,
    name: 'Authority Admin',
    email: 'authority-admin@test.com',
  });
  await buildUser({
    db: testDb,
    id: leaderUserId,
    name: 'Authority Leader',
    email: 'authority-leader@test.com',
  });
  await buildUser({
    db: testDb,
    id: volunteerUserId,
    name: 'Authority Volunteer',
    email: 'authority-volunteer@test.com',
  });
  await buildUser({
    db: testDb,
    id: strandedUserId,
    name: 'Authority Stranded',
    email: 'authority-stranded@test.com',
  });
  await buildUser({
    db: testDb,
    id: retiredUserId,
    name: 'Authority Retired',
    email: 'authority-retired@test.com',
  });

  await buildChurch({
    db: testDb,
    id: churchId,
    name: 'Authority Church',
    slug: 'authority-church',
    timezone: 'UTC',
  });

  await buildChurchMembership({
    db: testDb,
    churchId,
    userId: adminUserId,
    accessLevel: 'admin',
  });
  await buildChurchMembership({
    db: testDb,
    churchId,
    userId: leaderUserId,
    accessLevel: 'member',
  });
  await buildChurchMembership({
    db: testDb,
    churchId,
    userId: volunteerUserId,
    accessLevel: 'member',
  });
  await buildChurchMembership({
    db: testDb,
    churchId,
    userId: retiredUserId,
    accessLevel: 'member',
  });
  // strandedUserId deliberately gets no Church Membership and no Volunteer row.

  await buildMinistry({
    db: testDb,
    id: ministryId,
    churchId,
    name: 'Authority Ministry',
  });
  await buildTeam({
    db: testDb,
    id: teamId,
    churchId,
    ministryId,
    name: 'Authority Team',
  });
  await buildRole({
    db: testDb,
    id: roleId,
    churchId,
    ministryId,
    name: 'Authority Role',
  });

  await buildVolunteer({
    db: testDb,
    id: leaderVolunteerId,
    churchId,
    userId: leaderUserId,
  });
  await buildVolunteer({
    db: testDb,
    id: memberVolunteerId,
    churchId,
    userId: volunteerUserId,
  });
  // Retired profile — a departed Church Member who kept their Church
  // Membership (its own axis) but must never resolve as a Volunteer again.
  await buildVolunteer({
    db: testDb,
    id: retiredVolunteerId,
    churchId,
    userId: retiredUserId,
    leftAt: parseInstant({ value: '2024-01-01T00:00:00Z' }),
  });

  await buildMinistryMembership({
    db: testDb,
    churchId,
    ministryId,
    volunteerId: leaderVolunteerId,
    ministryAccessLevel: 'leader',
    roleIds: [],
    teams: [{ teamId, accessLevel: 'leader' }],
  });
  await buildMinistryMembership({
    db: testDb,
    churchId,
    ministryId,
    volunteerId: memberVolunteerId,
    ministryAccessLevel: 'volunteer',
    roleIds: [roleId],
    teams: [{ teamId, accessLevel: 'member' }],
  });
}

describe('DrizzleAuthorityActorResolver + AuthorityService (integration)', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('resolves a Church Membership admin with no Volunteer profile, allowed to manage the Church but not participate anywhere', async () => {
    const resolver = new DrizzleAuthorityActorResolver({ db: testDb });
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
    const resolver = new DrizzleAuthorityActorResolver({ db: testDb });
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
    const resolver = new DrizzleAuthorityActorResolver({ db: testDb });
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

  it('never resolves a retired Volunteer profile, even though Church Membership survives retirement', async () => {
    const resolver = new DrizzleAuthorityActorResolver({ db: testDb });
    const actor = await resolver.resolveActor({
      userId: retiredUserId,
      activeChurchId: churchId,
    });

    expect(actor.volunteerId).toBeNull();
    expect(actor.churchMembership).toEqual({ churchId, accessLevel: 'member' });
    expect(actor.ministryMemberships).toEqual([]);
    expect(actor.teamMemberships).toEqual([]);

    const decision = AuthorityService.authorize({
      actor,
      action: 'participate',
      resource: { type: 'ministry', churchId, ministryId },
    });

    expect(decision).toEqual({
      allowed: false,
      reason: 'INSUFFICIENT_ACCESS_LEVEL',
    });
  });

  it('resolves a User with no Church Membership row, denied everywhere with NO_CHURCH_MEMBERSHIP', async () => {
    const resolver = new DrizzleAuthorityActorResolver({ db: testDb });
    const actor = await resolver.resolveActor({
      userId: strandedUserId,
      activeChurchId: churchId,
    });

    expect(actor.volunteerId).toBeNull();
    expect(actor.churchMembership).toBeNull();
    expect(actor.ministryMemberships).toEqual([]);
    expect(actor.teamMemberships).toEqual([]);

    const decision = AuthorityService.authorize({
      actor,
      action: 'manage',
      resource: { type: 'church', churchId },
    });

    expect(decision).toEqual({
      allowed: false,
      reason: 'NO_CHURCH_MEMBERSHIP',
    });
  });
});
