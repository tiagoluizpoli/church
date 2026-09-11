import {
  addChurchMember,
  createChurch,
  ministry,
  ministryVolunteer,
  ministryVolunteerRole,
  ministryVolunteerTeam,
  role,
  type TenancyWriter,
  team,
  user,
  volunteer,
} from '@church/db';

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

  const churchARecord = await createChurch({
    db,
    name: `Northgate Community Church ${suffix}`,
    slug: `northgate-${suffix}`,
  });
  const churchBRecord = await createChurch({
    db,
    name: `Riverside Fellowship ${suffix}`,
    slug: `riverside-${suffix}`,
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

  await db.insert(user).values([
    {
      id: adminA,
      name: 'Fixture Admin A',
      email: `${adminA}@fixture.test`,
      emailVerified: true,
    },
    {
      id: leaderOfMinistryOneA,
      name: 'Fixture Leader One A',
      email: `${leaderOfMinistryOneA}@fixture.test`,
      emailVerified: true,
    },
    {
      id: leaderOfMinistryTwoA,
      name: 'Fixture Leader Two A',
      email: `${leaderOfMinistryTwoA}@fixture.test`,
      emailVerified: true,
    },
    {
      id: teamLeaderA,
      name: 'Fixture Team Leader A',
      email: `${teamLeaderA}@fixture.test`,
      emailVerified: true,
    },
    {
      id: memberNoVolunteerA,
      name: 'Fixture Member A',
      email: `${memberNoVolunteerA}@fixture.test`,
      emailVerified: true,
    },
    {
      id: existingChurchMemberA,
      name: 'Fixture Existing Member A',
      email: `${existingChurchMemberA}@fixture.test`,
      emailVerified: true,
    },
    {
      id: adminB,
      name: 'Fixture Admin B',
      email: `${adminB}@fixture.test`,
      emailVerified: true,
    },
    {
      id: dualMemberAB,
      name: 'Fixture Dual Member AB',
      email: `${dualMemberAB}@fixture.test`,
      emailVerified: true,
    },
  ]);

  await addChurchMember({
    db,
    churchId: churchA.id,
    userId: adminA,
    accessLevel: 'admin',
  });
  await addChurchMember({
    db,
    churchId: churchA.id,
    userId: leaderOfMinistryOneA,
  });
  await addChurchMember({
    db,
    churchId: churchA.id,
    userId: leaderOfMinistryTwoA,
  });
  await addChurchMember({ db, churchId: churchA.id, userId: teamLeaderA });
  await addChurchMember({
    db,
    churchId: churchA.id,
    userId: memberNoVolunteerA,
  });
  await addChurchMember({
    db,
    churchId: churchA.id,
    userId: existingChurchMemberA,
  });
  await addChurchMember({
    db,
    churchId: churchB.id,
    userId: adminB,
    accessLevel: 'admin',
  });
  await addChurchMember({ db, churchId: churchA.id, userId: dualMemberAB });
  await addChurchMember({ db, churchId: churchB.id, userId: dualMemberAB });

  const [ministryOneRow] = await db
    .insert(ministry)
    .values({ churchId: churchA.id, name: `Worship ${suffix}` })
    .returning();
  const [ministryTwoRow] = await db
    .insert(ministry)
    .values({ churchId: churchA.id, name: `Kids ${suffix}` })
    .returning();
  const [ministryInBRow] = await db
    .insert(ministry)
    .values({ churchId: churchB.id, name: `Hospitality ${suffix}` })
    .returning();
  if (!ministryOneRow || !ministryTwoRow || !ministryInBRow) {
    throw new Error('Ministry fixture insert failed');
  }

  const [teamOneRow] = await db
    .insert(team)
    .values({
      churchId: churchA.id,
      ministryId: ministryOneRow.id,
      name: `Sound Team ${suffix}`,
    })
    .returning();
  if (!teamOneRow) throw new Error('Team fixture insert failed');

  const [roleRow] = await db
    .insert(role)
    .values({
      churchId: churchA.id,
      ministryId: ministryOneRow.id,
      name: `Vocalist ${suffix}`,
    })
    .returning();
  if (!roleRow) throw new Error('Role fixture insert failed');

  const [teamInBRow] = await db
    .insert(team)
    .values({
      churchId: churchB.id,
      ministryId: ministryInBRow.id,
      name: `Greeter Team ${suffix}`,
    })
    .returning();
  const [roleInBRow] = await db
    .insert(role)
    .values({
      churchId: churchB.id,
      ministryId: ministryInBRow.id,
      name: `Greeter ${suffix}`,
    })
    .returning();
  if (!teamInBRow || !roleInBRow) {
    throw new Error('Church B team/role fixture insert failed');
  }

  const [leaderVolunteer] = await db
    .insert(volunteer)
    .values({ churchId: churchA.id, userId: leaderOfMinistryOneA })
    .returning();
  const [leaderTwoVolunteer] = await db
    .insert(volunteer)
    .values({ churchId: churchA.id, userId: leaderOfMinistryTwoA })
    .returning();
  const [teamLeaderVolunteer] = await db
    .insert(volunteer)
    .values({ churchId: churchA.id, userId: teamLeaderA })
    .returning();
  if (!leaderVolunteer || !leaderTwoVolunteer || !teamLeaderVolunteer) {
    throw new Error('Volunteer fixture insert failed');
  }

  await db.insert(ministryVolunteer).values([
    {
      churchId: churchA.id,
      volunteerId: leaderVolunteer.id,
      ministryId: ministryOneRow.id,
      ministryAccessLevel: 'leader',
    },
    {
      churchId: churchA.id,
      volunteerId: leaderTwoVolunteer.id,
      ministryId: ministryTwoRow.id,
      ministryAccessLevel: 'leader',
    },
  ]);

  const [teamLeaderMembership] = await db
    .insert(ministryVolunteer)
    .values({
      churchId: churchA.id,
      volunteerId: teamLeaderVolunteer.id,
      ministryId: ministryOneRow.id,
      ministryAccessLevel: 'volunteer',
    })
    .returning();
  if (!teamLeaderMembership)
    throw new Error('Membership fixture insert failed');

  await db.insert(ministryVolunteerTeam).values({
    churchId: churchA.id,
    ministryVolunteerId: teamLeaderMembership.id,
    teamId: teamOneRow.id,
    accessLevel: 'leader',
  });

  // `dualMemberAB`'s one active Volunteer profile lives in Church B, with a
  // Ministry Membership, a Role qualification and a Team membership there —
  // the rows a Volunteer Transfer retires or preserves (spec §8.2).
  const [dualVolunteerInB] = await db
    .insert(volunteer)
    .values({ churchId: churchB.id, userId: dualMemberAB })
    .returning();
  if (!dualVolunteerInB) {
    throw new Error('dualMemberAB volunteer fixture insert failed');
  }
  const [dualMembershipInB] = await db
    .insert(ministryVolunteer)
    .values({
      churchId: churchB.id,
      volunteerId: dualVolunteerInB.id,
      ministryId: ministryInBRow.id,
      ministryAccessLevel: 'volunteer',
    })
    .returning();
  if (!dualMembershipInB) {
    throw new Error('dualMemberAB membership fixture insert failed');
  }
  await db.insert(ministryVolunteerRole).values({
    churchId: churchB.id,
    ministryVolunteerId: dualMembershipInB.id,
    roleId: roleInBRow.id,
  });
  await db.insert(ministryVolunteerTeam).values({
    churchId: churchB.id,
    ministryVolunteerId: dualMembershipInB.id,
    teamId: teamInBRow.id,
    accessLevel: 'member',
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
