import type { TenancyWriter } from '@church/db';
import {
  buildChurch,
  buildChurchMembership,
} from '../../seeds/builders/church';
import { buildUser } from '../../seeds/builders/identity';
import {
  buildMinistry,
  buildRole,
  buildTeam,
} from '../../seeds/builders/ministry';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '../../seeds/builders/volunteer';

export interface TwoChurchIdentityFixtureInput {
  db: TenancyWriter;
}

export interface ChurchSummary {
  id: string;
  name: string;
  slug: string;
}

export interface TwoChurchIdentityFixture {
  churchA: ChurchSummary;
  churchB: ChurchSummary;
  ministryOneA: string;
  ministryTwoA: string;
  teamOneA: string;
  roleInMinistryOneA: string;
  adminA: string;
  leaderOfMinistryOneA: string;
  leaderOfMinistryTwoA: string;
  teamLeaderA: string;
  memberNoVolunteerA: string;
  existingChurchMemberA: string;
  ministryInB: string;
  roleInMinistryInB: string;
  teamInB: string;
  adminB: string;
  /**
   * A Church Member of *both* A and B whose one active Volunteer profile lives
   * in Church B. Redeeming a Church A invitation as this User is the
   * cross-Church split (spec §7.5); Volunteer Transfer (§8) is their way out.
   */
  dualMemberAB: string;
  /** `dualMemberAB`'s active `volunteer` row id, in Church B. */
  dualMemberABVolunteerInB: string;
  /** `dualMemberAB`'s `ministry_volunteer` row id, in `ministryInB`. */
  dualMemberABMembershipInB: string;
}

interface FixtureUser {
  id: string;
  name: string;
}

interface FixtureChurchMembership {
  churchId: string;
  userId: string;
  accessLevel: 'member' | 'admin';
}

/**
 * One canonical two-Church identity fixture, chosen so every Ministry
 * Invitation minting rule has a real counterexample: a ChurchAdmin, two
 * Ministry leaders of *different* Ministries in the *same* Church (the
 * cross-Ministry deny AuthorityService alone can express), a TeamLeader
 * (Team-scoped only, never Ministry-wide), a Church Member with no
 * Volunteer profile, and a second, distinctly-named Church for cross-tenant
 * assertions — named distinctively enough that a substring assertion on the
 * response means something.
 */
export async function seedTwoChurchIdentityFixture(
  input: TwoChurchIdentityFixtureInput,
): Promise<TwoChurchIdentityFixture> {
  const { db } = input;
  const suffix = crypto.randomUUID().slice(0, 8);

  const churchARecord = await buildChurch({
    db,
    id: crypto.randomUUID(),
    name: `Northgate Community Church ${suffix}`,
    slug: `northgate-${suffix}`,
    timezone: 'UTC',
  });
  const churchBRecord = await buildChurch({
    db,
    id: crypto.randomUUID(),
    name: `Riverside Fellowship ${suffix}`,
    slug: `riverside-${suffix}`,
    timezone: 'UTC',
  });

  const churchA: ChurchSummary = {
    id: churchARecord.id,
    name: churchARecord.name,
    slug: churchARecord.slug,
  };
  const churchB: ChurchSummary = {
    id: churchBRecord.id,
    name: churchBRecord.name,
    slug: churchBRecord.slug,
  };

  const adminA = `fixture-admin-a-${suffix}`;
  const leaderOfMinistryOneA = `fixture-leader-one-a-${suffix}`;
  const leaderOfMinistryTwoA = `fixture-leader-two-a-${suffix}`;
  const teamLeaderA = `fixture-team-leader-a-${suffix}`;
  const memberNoVolunteerA = `fixture-member-a-${suffix}`;
  const existingChurchMemberA = `fixture-existing-member-a-${suffix}`;
  const adminB = `fixture-admin-b-${suffix}`;
  const dualMemberAB = `fixture-dual-member-ab-${suffix}`;

  const users: FixtureUser[] = [
    { id: adminA, name: 'Fixture Admin A' },
    { id: leaderOfMinistryOneA, name: 'Fixture Leader One A' },
    { id: leaderOfMinistryTwoA, name: 'Fixture Leader Two A' },
    { id: teamLeaderA, name: 'Fixture Team Leader A' },
    { id: memberNoVolunteerA, name: 'Fixture Member A' },
    { id: existingChurchMemberA, name: 'Fixture Existing Member A' },
    { id: adminB, name: 'Fixture Admin B' },
    { id: dualMemberAB, name: 'Fixture Dual Member AB' },
  ];
  for (const fixtureUser of users) {
    await buildUser({
      db,
      id: fixtureUser.id,
      name: fixtureUser.name,
      email: `${fixtureUser.id}@fixture.test`,
    });
  }

  const memberships: FixtureChurchMembership[] = [
    { churchId: churchA.id, userId: adminA, accessLevel: 'admin' },
    {
      churchId: churchA.id,
      userId: leaderOfMinistryOneA,
      accessLevel: 'member',
    },
    {
      churchId: churchA.id,
      userId: leaderOfMinistryTwoA,
      accessLevel: 'member',
    },
    { churchId: churchA.id, userId: teamLeaderA, accessLevel: 'member' },
    { churchId: churchA.id, userId: memberNoVolunteerA, accessLevel: 'member' },
    {
      churchId: churchA.id,
      userId: existingChurchMemberA,
      accessLevel: 'member',
    },
    { churchId: churchB.id, userId: adminB, accessLevel: 'admin' },
    { churchId: churchA.id, userId: dualMemberAB, accessLevel: 'member' },
    { churchId: churchB.id, userId: dualMemberAB, accessLevel: 'member' },
  ];
  for (const membership of memberships) {
    await buildChurchMembership({ db, ...membership });
  }

  const ministryOneRow = await buildMinistry({
    db,
    churchId: churchA.id,
    name: `Worship ${suffix}`,
  });
  const ministryTwoRow = await buildMinistry({
    db,
    churchId: churchA.id,
    name: `Kids ${suffix}`,
  });
  const ministryInBRow = await buildMinistry({
    db,
    churchId: churchB.id,
    name: `Hospitality ${suffix}`,
  });

  const teamOneRow = await buildTeam({
    db,
    churchId: churchA.id,
    ministryId: ministryOneRow.id,
    name: `Sound Team ${suffix}`,
  });
  const roleRow = await buildRole({
    db,
    churchId: churchA.id,
    ministryId: ministryOneRow.id,
    name: `Vocalist ${suffix}`,
  });
  const teamInBRow = await buildTeam({
    db,
    churchId: churchB.id,
    ministryId: ministryInBRow.id,
    name: `Greeter Team ${suffix}`,
  });
  const roleInBRow = await buildRole({
    db,
    churchId: churchB.id,
    ministryId: ministryInBRow.id,
    name: `Greeter ${suffix}`,
  });

  const leaderVolunteer = await buildVolunteer({
    db,
    churchId: churchA.id,
    userId: leaderOfMinistryOneA,
  });
  const leaderTwoVolunteer = await buildVolunteer({
    db,
    churchId: churchA.id,
    userId: leaderOfMinistryTwoA,
  });
  const teamLeaderVolunteer = await buildVolunteer({
    db,
    churchId: churchA.id,
    userId: teamLeaderA,
  });

  await buildMinistryMembership({
    db,
    churchId: churchA.id,
    volunteerId: leaderVolunteer.id,
    ministryId: ministryOneRow.id,
    ministryAccessLevel: 'leader',
    roleIds: [],
    teams: [],
  });
  await buildMinistryMembership({
    db,
    churchId: churchA.id,
    volunteerId: leaderTwoVolunteer.id,
    ministryId: ministryTwoRow.id,
    ministryAccessLevel: 'leader',
    roleIds: [],
    teams: [],
  });

  await buildMinistryMembership({
    db,
    churchId: churchA.id,
    volunteerId: teamLeaderVolunteer.id,
    ministryId: ministryOneRow.id,
    ministryAccessLevel: 'volunteer',
    roleIds: [],
    teams: [{ teamId: teamOneRow.id, accessLevel: 'leader' }],
  });

  // `dualMemberAB`'s one active Volunteer profile lives in Church B, with a
  // Ministry Membership, a Role qualification and a Team membership there —
  // the rows a Volunteer Transfer retires or preserves (spec §8.2).
  const dualVolunteerInB = await buildVolunteer({
    db,
    churchId: churchB.id,
    userId: dualMemberAB,
  });
  const dualMembershipInB = await buildMinistryMembership({
    db,
    churchId: churchB.id,
    volunteerId: dualVolunteerInB.id,
    ministryId: ministryInBRow.id,
    ministryAccessLevel: 'volunteer',
    roleIds: [roleInBRow.id],
    teams: [{ teamId: teamInBRow.id, accessLevel: 'member' }],
  });

  return {
    churchA,
    churchB,
    ministryOneA: ministryOneRow.id,
    ministryTwoA: ministryTwoRow.id,
    teamOneA: teamOneRow.id,
    roleInMinistryOneA: roleRow.id,
    adminA,
    leaderOfMinistryOneA,
    leaderOfMinistryTwoA,
    teamLeaderA,
    memberNoVolunteerA,
    existingChurchMemberA,
    ministryInB: ministryInBRow.id,
    roleInMinistryInB: roleInBRow.id,
    teamInB: teamInBRow.id,
    adminB,
    dualMemberAB,
    dualMemberABVolunteerInB: dualVolunteerInB.id,
    dualMemberABMembershipInB: dualMembershipInB.id,
  };
}
