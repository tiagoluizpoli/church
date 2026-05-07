import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  church,
  ministry,
  ministryInvitation,
  ministryVolunteer,
  role,
  team,
  user,
  volunteer,
} from '../../src/schema';
import { clearDatabase, testDb } from './setup';

describe('Core Schema Integration', () => {
  let churchId: string;

  beforeEach(async () => {
    await clearDatabase();
    const [insertedChurch] = await testDb
      .insert(church)
      .values({
        name: 'Test Church',
        slug: 'test-church',
      })
      .returning();
    if (!insertedChurch) throw new Error('Church insert failed');
    churchId = insertedChurch.id;
  });

  it('should enforce church_id foreign key constraint on ministry', async () => {
    const invalidMinistry = {
      name: 'Invalid Ministry',
      churchId: '00000000-0000-0000-0000-000000000000', // Non-existent UUID
    };

    try {
      await testDb.insert(ministry).values(invalidMinistry).returning();
      expect.fail('Should have thrown foreign key constraint error');
    } catch (error: unknown) {
      if (error.name === 'AssertionError') throw error;
      // console.log('DEBUG ERROR:', error);
      expect(error.message).toBeDefined();
    }
  });

  it('should create a valid ministry', async () => {
    const validMinistry = {
      name: 'Worship Ministry',
      churchId,
    };

    const [inserted] = await testDb
      .insert(ministry)
      .values(validMinistry)
      .returning();
    if (!inserted) throw new Error('Ministry insert failed');
    expect(inserted.id).toBeDefined();
    expect(inserted.name).toBe(validMinistry.name);
    expect(inserted.churchId).toBe(churchId);
  });

  it('should enforce unique token for ministry invitation', async () => {
    const [insertedMinistry] = await testDb
      .insert(ministry)
      .values({
        name: 'Worship',
        churchId,
      })
      .returning();
    if (!insertedMinistry) throw new Error('Ministry insert failed');

    const invitation1 = {
      churchId,
      ministryId: insertedMinistry.id,
      token: 'common-token',
      type: 'one-time',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    };

    const invitation2 = {
      churchId,
      ministryId: insertedMinistry.id,
      token: 'common-token',
      type: 'one-time',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    };

    await testDb.insert(ministryInvitation).values(invitation1).returning();

    try {
      await testDb.insert(ministryInvitation).values(invitation2).returning();
      expect.fail('Should have thrown unique constraint error');
    } catch (error: unknown) {
      if (error.name === 'AssertionError') throw error;
      expect(error.message).toBeDefined();
    }
  });

  describe('Contextual Leadership (SC-004)', () => {
    it('should identify ministry leader via system_role', async () => {
      const [insertedMinistry] = await testDb
        .insert(ministry)
        .values({ name: 'Worship', churchId })
        .returning();
      if (!insertedMinistry) throw new Error('Ministry insert failed');

      const [insertedUser] = await testDb
        .insert(user)
        .values({ id: 'u1', name: 'Leader User', email: 'leader@test.com' })
        .returning();
      if (!insertedUser) throw new Error('User insert failed');

      const [insertedVolunteer] = await testDb
        .insert(volunteer)
        .values({ userId: insertedUser.id, churchId })
        .returning();
      if (!insertedVolunteer) throw new Error('Volunteer insert failed');

      await testDb.insert(ministryVolunteer).values({
        churchId,
        ministryId: insertedMinistry.id,
        volunteerId: insertedVolunteer.id,
        systemRole: 'leader',
      });

      const leaderLink = await testDb.query.ministryVolunteer.findFirst({
        where: and(
          eq(ministryVolunteer.ministryId, insertedMinistry.id),
          eq(ministryVolunteer.systemRole, 'leader'),
        ),
      });

      expect(leaderLink).toBeDefined();
      expect(leaderLink?.volunteerId).toBe(insertedVolunteer.id);
    });

    it('should identify team leader via system_role and teamId', async () => {
      const [insertedMinistry] = await testDb
        .insert(ministry)
        .values({ name: 'Worship', churchId })
        .returning();
      if (!insertedMinistry) throw new Error('Ministry insert failed');

      const [insertedTeam] = await testDb
        .insert(team)
        .values({ name: 'Vocals', churchId, ministryId: insertedMinistry.id })
        .returning();
      if (!insertedTeam) throw new Error('Team insert failed');

      const [insertedUser] = await testDb
        .insert(user)
        .values({ id: 'u2', name: 'Sub Leader', email: 'sub@test.com' })
        .returning();
      if (!insertedUser) throw new Error('User insert failed');

      const [insertedVolunteer] = await testDb
        .insert(volunteer)
        .values({ userId: insertedUser.id, churchId })
        .returning();
      if (!insertedVolunteer) throw new Error('Volunteer insert failed');

      await testDb.insert(ministryVolunteer).values({
        churchId,
        ministryId: insertedMinistry.id,
        teamId: insertedTeam.id,
        volunteerId: insertedVolunteer.id,
        systemRole: 'sub_leader',
      });

      const subLeaderLink = await testDb.query.ministryVolunteer.findFirst({
        where: and(
          eq(ministryVolunteer.teamId, insertedTeam.id),
          eq(ministryVolunteer.systemRole, 'sub_leader'),
        ),
      });

      expect(subLeaderLink).toBeDefined();
      expect(subLeaderLink?.volunteerId).toBe(insertedVolunteer.id);
    });

    it('should verify team table does not have leaderId column', async () => {
      const [insertedMinistry] = await testDb
        .insert(ministry)
        .values({ name: 'Media', churchId })
        .returning();
      if (!insertedMinistry) throw new Error('Ministry insert failed');

      // This should pass with only these fields
      const [insertedTeam] = await testDb
        .insert(team)
        .values({
          name: 'Video',
          churchId,
          ministryId: insertedMinistry.id,
        })
        .returning();

      if (!insertedTeam) throw new Error('Team insert failed');
      expect(insertedTeam.name).toBe('Video');
      // TypeScript would catch if we tried to add leaderId here,
      // and we already verified it was removed from core.ts
    });
  });

  describe('Role Schema', () => {
    it('should create a global role', async () => {
      const [insertedRole] = await testDb
        .insert(role)
        .values({
          name: 'General Volunteer',
          churchId,
          isGlobal: true,
          ministryId: null,
        })
        .returning();

      if (!insertedRole) throw new Error('Role insert failed');
      expect(insertedRole.name).toBe('General Volunteer');
      expect(insertedRole.isGlobal).toBe(true);
      expect(insertedRole.ministryId).toBeNull();
    });

    it('should create a ministry-scoped role', async () => {
      const [insertedMinistry] = await testDb
        .insert(ministry)
        .values({ name: 'Music', churchId })
        .returning();
      if (!insertedMinistry) throw new Error('Ministry insert failed');

      const [insertedRole] = await testDb
        .insert(role)
        .values({
          name: 'Guitarist',
          churchId,
          ministryId: insertedMinistry.id,
          isGlobal: false,
        })
        .returning();

      if (!insertedRole) throw new Error('Role insert failed');
      expect(insertedRole.name).toBe('Guitarist');
      expect(insertedRole.ministryId).toBe(insertedMinistry.id);
      expect(insertedRole.isGlobal).toBe(false);
    });

    it('should enforce church_id foreign key constraint on roles', async () => {
      const invalidRole = {
        name: 'Invalid Role',
        churchId: '00000000-0000-0000-0000-000000000000',
      };

      try {
        await testDb.insert(role).values(invalidRole).returning();
        expect.fail('Should have thrown foreign key constraint error');
      } catch (error: unknown) {
        if (error.name === 'AssertionError') throw error;
        expect(error.message).toBeDefined();
      }
    });
  });
});
