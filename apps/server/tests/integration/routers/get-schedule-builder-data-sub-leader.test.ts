import { ministryVolunteer, team, volunteer } from '@church/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed, testDb, truncateAll } from '../repositories/setup';
import { createCaller, promoteToSubLeader, SEED } from './caller';

const TEAM_A = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeea1';
const TEAM_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeb2';
const USER_CAROL = 'sub-user-carol';
const USER_DAVE = 'sub-user-dave';
const VOL_CAROL = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaac1';
const VOL_DAVE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaad2';

interface TeamMemberInput {
  userId: string;
  volunteerId: string;
  teamId: string;
  name: string;
}

async function addMember(member: TeamMemberInput): Promise<void> {
  const { userId, volunteerId, teamId, name } = member;
  await testDb.execute(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ('${userId}', '${name}', '${userId}@test.com', true, now(), now())`,
  );
  await testDb.insert(volunteer).values({
    id: volunteerId,
    churchId: SEED.church,
    userId,
    status: 'active',
  });
  await testDb.insert(ministryVolunteer).values({
    id: `dddddddd-dddd-dddd-dddd-${volunteerId.slice(-12)}`,
    churchId: SEED.church,
    volunteerId,
    ministryId: SEED.ministryAdult,
    teamId,
    systemRole: 'volunteer',
    status: 'active',
  });
}

describe('getScheduleBuilderData — sub-leader scoping (T120)', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
    await testDb.insert(team).values([
      {
        id: TEAM_A,
        churchId: SEED.church,
        ministryId: SEED.ministryAdult,
        name: 'Team A',
      },
      {
        id: TEAM_B,
        churchId: SEED.church,
        ministryId: SEED.ministryAdult,
        name: 'Team B',
      },
    ]);
    // Alice is the sub-leader of Team A.
    await promoteToSubLeader(SEED.volunteerAlice, SEED.ministryAdult, TEAM_A);
    await addMember({
      userId: USER_CAROL,
      volunteerId: VOL_CAROL,
      teamId: TEAM_A,
      name: 'Carol',
    });
    await addMember({
      userId: USER_DAVE,
      volunteerId: VOL_DAVE,
      teamId: TEAM_B,
      name: 'Dave',
    });
  });

  it('returns callerTeamId equal to the sub-leader team', async () => {
    const data = await createCaller(
      SEED.userAlice,
    ).adminLeader.getScheduleBuilderData({ eventId: SEED.eventDraft });
    expect(data.callerTeamId).toBe(TEAM_A);
  });

  it('scopes volunteerAvailability to the caller team only', async () => {
    const data = await createCaller(
      SEED.userAlice,
    ).adminLeader.getScheduleBuilderData({ eventId: SEED.eventDraft });
    const ids = data.volunteerAvailability.map((v) => v.volunteerId);
    expect(ids).toContain(SEED.volunteerAlice);
    expect(ids).toContain(VOL_CAROL);
    expect(ids).not.toContain(VOL_DAVE);
  });
});
