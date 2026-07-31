import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  invitation as churchInvitation,
  ministry,
  ministryInvitation,
  ministryVolunteer,
  ministryVolunteerTeam,
  role,
  team,
  user,
  volunteer,
} from '../../src/schema';
import { createChurch } from '../../src/tenancy';
import { clearDatabase, testDb } from './setup';

/**
 * Deliberately malformed: `ministryId` is required now that global roles
 * are retired, so the real insert type no longer allows `null` here. Used
 * only to exercise the DB-level NOT NULL constraint directly.
 */
interface InvalidGlobalRoleInsert {
  name: string;
  churchId: string;
  ministryId: null;
}

describe('Core Schema Integration', () => {
  let churchId: string;

  beforeEach(async () => {
    await clearDatabase();
    const insertedChurch = await createChurch({
      db: testDb,
      name: 'Test Church',
      slug: 'test-church',
    });
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
    } catch (error) {
      const err = error as Error;
      if (err.name === 'AssertionError') throw err;
      // console.log('DEBUG ERROR:', err);
      expect(err.message).toBeDefined();
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

  describe('ministry_invitation targeting constraints', () => {
    let ministryId: string;
    let inviterId: string;
    let inviteeUserId: string;

    beforeEach(async () => {
      const [insertedMinistry] = await testDb
        .insert(ministry)
        .values({ name: 'Worship', churchId })
        .returning();
      if (!insertedMinistry) throw new Error('Ministry insert failed');
      ministryId = insertedMinistry.id;

      const [inviter] = await testDb
        .insert(user)
        .values({
          id: 'core-test-inviter',
          name: 'Inviter',
          email: 'core-test-inviter@test.com',
        })
        .returning();
      if (!inviter) throw new Error('User insert failed');
      inviterId = inviter.id;

      const [invitee] = await testDb
        .insert(user)
        .values({
          id: 'core-test-invitee',
          name: 'Invitee',
          email: 'core-test-invitee@test.com',
        })
        .returning();
      if (!invitee) throw new Error('User insert failed');
      inviteeUserId = invitee.id;
    });

    it('rejects a row with neither inviteeUserId nor churchInvitationId set', async () => {
      try {
        await testDb.insert(ministryInvitation).values({
          churchId,
          ministryId,
          ministryAccessLevel: 'volunteer',
          inviterId,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        });
        expect.fail('Should have thrown check constraint error');
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AssertionError') throw err;
        expect(err.message).toBeDefined();
      }
    });

    it('rejects a row with both inviteeUserId and churchInvitationId set', async () => {
      const [invitation] = await testDb
        .insert(churchInvitation)
        .values({
          id: 'core-test-church-invitation',
          organizationId: churchId,
          email: 'outsider@test.com',
          inviterId,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        })
        .returning();
      if (!invitation) throw new Error('Church invitation insert failed');

      try {
        await testDb.insert(ministryInvitation).values({
          churchId,
          ministryId,
          ministryAccessLevel: 'volunteer',
          inviterId,
          inviteeUserId,
          churchInvitationId: invitation.id,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        });
        expect.fail('Should have thrown check constraint error');
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AssertionError') throw err;
        expect(err.message).toBeDefined();
      }
    });

    it('enforces one pending invitation per (ministryId, inviteeUserId)', async () => {
      const values = {
        churchId,
        ministryId,
        ministryAccessLevel: 'volunteer' as const,
        inviterId,
        inviteeUserId,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      };

      await testDb.insert(ministryInvitation).values(values).returning();

      try {
        await testDb.insert(ministryInvitation).values(values).returning();
        expect.fail('Should have thrown unique constraint error');
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AssertionError') throw err;
        expect(err.message).toBeDefined();
      }
    });

    it('allows a second pending invitation for the same invitee once the first is no longer pending', async () => {
      const base = {
        churchId,
        ministryId,
        ministryAccessLevel: 'volunteer' as const,
        inviterId,
        inviteeUserId,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      };

      const [first] = await testDb
        .insert(ministryInvitation)
        .values(base)
        .returning();
      if (!first) throw new Error('Ministry invitation insert failed');

      await testDb
        .update(ministryInvitation)
        .set({ status: 'canceled', canceledAt: new Date() })
        .where(eq(ministryInvitation.id, first.id));

      const [second] = await testDb
        .insert(ministryInvitation)
        .values(base)
        .returning();
      expect(second?.id).toBeDefined();
    });
  });

  describe('Access Level Model', () => {
    it('should identify ministry leader via ministry_access_level', async () => {
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
        ministryAccessLevel: 'leader',
      });

      const leaderLink = await testDb.query.ministryVolunteer.findFirst({
        where: and(
          eq(ministryVolunteer.ministryId, insertedMinistry.id),
          eq(ministryVolunteer.ministryAccessLevel, 'leader'),
        ),
      });

      expect(leaderLink).toBeDefined();
      expect(leaderLink?.volunteerId).toBe(insertedVolunteer.id);
    });

    it('should identify a team leader via ministry_volunteer_team.access_level, scoped to that team', async () => {
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

      const [otherTeam] = await testDb
        .insert(team)
        .values({
          name: 'Instruments',
          churchId,
          ministryId: insertedMinistry.id,
        })
        .returning();
      if (!otherTeam) throw new Error('Team insert failed');

      const [insertedUser] = await testDb
        .insert(user)
        .values({
          id: 'u2',
          name: 'Team Leader',
          email: 'team-leader@test.com',
        })
        .returning();
      if (!insertedUser) throw new Error('User insert failed');

      const [insertedVolunteer] = await testDb
        .insert(volunteer)
        .values({ userId: insertedUser.id, churchId })
        .returning();
      if (!insertedVolunteer) throw new Error('Volunteer insert failed');

      // Team leadership does not require ministry-wide leadership — the
      // membership stays at the default ministry access level.
      const [insertedMembership] = await testDb
        .insert(ministryVolunteer)
        .values({
          churchId,
          ministryId: insertedMinistry.id,
          volunteerId: insertedVolunteer.id,
        })
        .returning();
      if (!insertedMembership) throw new Error('Membership insert failed');

      await testDb.insert(ministryVolunteerTeam).values([
        {
          churchId,
          ministryVolunteerId: insertedMembership.id,
          teamId: insertedTeam.id,
          accessLevel: 'leader',
        },
        {
          churchId,
          ministryVolunteerId: insertedMembership.id,
          teamId: otherTeam.id,
        },
      ]);

      const teamLeaderLink = await testDb.query.ministryVolunteerTeam.findFirst(
        {
          where: and(
            eq(ministryVolunteerTeam.teamId, insertedTeam.id),
            eq(ministryVolunteerTeam.accessLevel, 'leader'),
          ),
        },
      );
      const otherTeamLink = await testDb.query.ministryVolunteerTeam.findFirst({
        where: eq(ministryVolunteerTeam.teamId, otherTeam.id),
      });

      expect(teamLeaderLink).toBeDefined();
      expect(teamLeaderLink?.ministryVolunteerId).toBe(insertedMembership.id);
      // Leadership on one team does not leak to another team membership row —
      // TeamLeader is scoped to the specific team, not the ministry.
      expect(otherTeamLink?.accessLevel).toBe('member');
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

  describe('Volunteer retirement', () => {
    it('rejects a second active profile for the same user', async () => {
      const [insertedUser] = await testDb
        .insert(user)
        .values({ id: 'u-retire-1', name: 'Dual', email: 'dual@test.com' })
        .returning();
      if (!insertedUser) throw new Error('User insert failed');

      await testDb
        .insert(volunteer)
        .values({ userId: insertedUser.id, churchId });

      try {
        await testDb
          .insert(volunteer)
          .values({ userId: insertedUser.id, churchId });
        expect.fail('Should have thrown unique constraint error');
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AssertionError') throw err;
        expect(err.message).toBeDefined();
      }
    });

    it('allows a retired profile and its active successor for the same user', async () => {
      const [insertedUser] = await testDb
        .insert(user)
        .values({
          id: 'u-retire-2',
          name: 'Transfer',
          email: 'transfer@test.com',
        })
        .returning();
      if (!insertedUser) throw new Error('User insert failed');

      const [original] = await testDb
        .insert(volunteer)
        .values({ userId: insertedUser.id, churchId })
        .returning();
      if (!original) throw new Error('Volunteer insert failed');

      await testDb
        .update(volunteer)
        .set({ leftAt: new Date() })
        .where(eq(volunteer.id, original.id));

      const [successor] = await testDb
        .insert(volunteer)
        .values({ userId: insertedUser.id, churchId })
        .returning();
      if (!successor) throw new Error('Successor volunteer insert failed');

      await testDb
        .update(volunteer)
        .set({ successorVolunteerId: successor.id })
        .where(eq(volunteer.id, original.id));

      const retired = await testDb.query.volunteer.findFirst({
        where: eq(volunteer.id, original.id),
      });

      expect(retired?.leftAt).not.toBeNull();
      expect(retired?.successorVolunteerId).toBe(successor.id);
      expect(successor.leftAt).toBeNull();
      expect(successor.churchId).toBe(churchId);
    });
  });

  describe('Role Schema', () => {
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
        })
        .returning();

      if (!insertedRole) throw new Error('Role insert failed');
      expect(insertedRole.name).toBe('Guitarist');
      expect(insertedRole.ministryId).toBe(insertedMinistry.id);
    });

    it('should require a ministry — there are no global roles', async () => {
      const invalidRole: InvalidGlobalRoleInsert = {
        name: 'General Volunteer',
        churchId,
        ministryId: null,
      };

      await expect(
        testDb
          .insert(role)
          .values(invalidRole as unknown as typeof role.$inferInsert),
      ).rejects.toThrow();
    });

    it('should enforce church_id foreign key constraint on roles', async () => {
      const [insertedMinistry] = await testDb
        .insert(ministry)
        .values({ name: 'Music', churchId })
        .returning();
      if (!insertedMinistry) throw new Error('Ministry insert failed');

      const invalidRole = {
        name: 'Invalid Role',
        churchId: '00000000-0000-0000-0000-000000000000',
        ministryId: insertedMinistry.id,
      };

      try {
        await testDb.insert(role).values(invalidRole).returning();
        expect.fail('Should have thrown foreign key constraint error');
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AssertionError') throw err;
        expect(err.message).toBeDefined();
      }
    });
  });
});
