import { db, ministry, ministryVolunteer, user, volunteer } from '@church/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DbMinistryManager } from '../../src/application/db-ministry-manager';
import type { ChurchId } from '../../src/domain/entities/church';
import type { VolunteerId } from '../../src/domain/entities/volunteer';
import { DrizzleMinistryRepository } from '../../src/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleVolunteerRepository } from '../../src/infrastructure/repositories/drizzle-volunteer.repository';

const CHURCH = '11111111-1111-1111-1111-111111111111' as ChurchId;
const LEADER_VOL = 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as VolunteerId;
const NON_LEADER_VOL = 'bbbb0002-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as VolunteerId;
const MINISTRY_A = 'cccc0001-cccc-cccc-cccc-cccccccccccc';
const MINISTRY_B = 'dddd0002-dddd-dddd-dddd-dddddddddddd';
const MV_LEADER_A = 'eeee0001-eeee-eeee-eeee-eeeeeeeeeeee';
const MV_MEMBER_B = 'ffff0002-ffff-ffff-ffff-ffffffffffff';

async function truncate() {
  await db.delete(ministryVolunteer);
  await db.delete(volunteer);
  await db.delete(ministry);
  await db.delete(user).where(sql`id IN ('user-leader-1', 'user-member-2')`);
}

beforeAll(async () => {
  await truncate();

  await db.insert(user).values([
    {
      id: 'user-leader-1',
      name: 'Leader One',
      email: 'leader1@test.test',
      emailVerified: false,
    },
    {
      id: 'user-member-2',
      name: 'Member Two',
      email: 'member2@test.test',
      emailVerified: false,
    },
  ]);

  await db.insert(ministry).values([
    {
      id: MINISTRY_A,
      churchId: CHURCH,
      name: 'Worship',
      enforcementType: 'soft',
    },
    { id: MINISTRY_B, churchId: CHURCH, name: 'Kids', enforcementType: 'soft' },
  ]);

  await db.insert(volunteer).values([
    {
      id: LEADER_VOL,
      churchId: CHURCH,
      userId: 'user-leader-1',
      status: 'active',
    },
    {
      id: NON_LEADER_VOL,
      churchId: CHURCH,
      userId: 'user-member-2',
      status: 'active',
    },
  ]);

  await db.insert(ministryVolunteer).values([
    {
      id: MV_LEADER_A,
      churchId: CHURCH,
      volunteerId: LEADER_VOL,
      ministryId: MINISTRY_A,
      systemRole: 'leader',
      status: 'active',
    },
    {
      id: MV_MEMBER_B,
      churchId: CHURCH,
      volunteerId: NON_LEADER_VOL,
      ministryId: MINISTRY_B,
      systemRole: 'volunteer',
      status: 'active',
    },
  ]);
});

afterAll(async () => {
  await truncate();
});

describe('DbMinistryManager.listByLeader (T032)', () => {
  const ministryRepo = new DrizzleMinistryRepository(db);
  const volunteerRepo = new DrizzleVolunteerRepository(db);
  const manager = new DbMinistryManager(ministryRepo, volunteerRepo);

  it('returns ministries where volunteer is leader', async () => {
    const result = await manager.listByLeader({
      leaderId: LEADER_VOL,
      churchId: CHURCH,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Worship');
  });

  it('returns empty array when volunteer is not a leader in any ministry', async () => {
    const result = await manager.listByLeader({
      leaderId: NON_LEADER_VOL,
      churchId: CHURCH,
    });
    expect(result).toHaveLength(0);
  });

  it('does not cross church boundaries', async () => {
    const otherChurch = '22222222-2222-2222-2222-222222222222' as ChurchId;
    const result = await manager.listByLeader({
      leaderId: LEADER_VOL,
      churchId: otherChurch,
    });
    expect(result).toHaveLength(0);
  });
});
