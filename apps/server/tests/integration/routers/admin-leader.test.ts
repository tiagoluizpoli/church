import {
  assignment,
  event,
  ministry,
  ministryVolunteer,
  timeSlot,
} from '@church/db';
import { and, eq, inArray } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { appRouter } from '../../../src/routers';
import { seed, testDb, truncateAll } from '../repositories/setup';

describe('AdminLeader Router Integration Tests', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
  });

  const createCaller = (userId: string) => {
    return appRouter.createCaller({
      session: {
        user: {
          id: userId,
          name: 'Test User',
          email: 'test@user.com',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        session: {
          id: 'sess-1',
          userId,
          token: 'tok-1',
          expiresAt: new Date(Date.now() + 3600000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      auth: null,
    });
  };

  const promoteToLeader = async (volunteerId: string, ministryId: string) => {
    await testDb
      .update(ministryVolunteer)
      .set({ systemRole: 'leader' })
      .where(
        and(
          eq(ministryVolunteer.volunteerId, volunteerId),
          eq(ministryVolunteer.ministryId, ministryId),
        ),
      );
  };

  const promoteToAdmin = async (volunteerId: string) => {
    const adminMinistryId = '33333333-3333-3333-3333-333333333339';
    await testDb.insert(ministry).values({
      id: adminMinistryId,
      churchId: '11111111-1111-1111-1111-111111111111',
      name: 'Administration',
      enforcementType: 'soft',
    });
    await testDb.insert(ministryVolunteer).values({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccca9',
      churchId: '11111111-1111-1111-1111-111111111111',
      volunteerId,
      ministryId: adminMinistryId,
      systemRole: 'leader',
      status: 'active',
    });
  };

  describe('Authorization / RBAC Checks', () => {
    it('fails when user has no session (unauthorized)', async () => {
      const caller = appRouter.createCaller({
        session: null,
        auth: null,
      });

      await expect(
        caller.adminLeader.getScheduleBuilderData({
          eventId: '66666666-6666-6666-6666-666666666661',
        }),
      ).rejects.toThrow('Authentication required');
    });

    it('fails when volunteer is only a regular volunteer (not a leader)', async () => {
      const caller = createCaller('22222222-2222-2222-2222-222222222221'); // Alice (volunteer-1)
      await expect(
        caller.adminLeader.getScheduleBuilderData({
          eventId: '66666666-6666-6666-6666-666666666661',
        }),
      ).rejects.toThrow(
        'User is not authorized to access this schedule builder',
      );
    });

    it('succeeds when volunteer is promoted to leader of the event ministry', async () => {
      await promoteToLeader(
        '44444444-4444-4444-4444-444444444441',
        '33333333-3333-3333-3333-333333333331',
      );
      const caller = createCaller('22222222-2222-2222-2222-222222222221');
      const data = await caller.adminLeader.getScheduleBuilderData({
        eventId: '66666666-6666-6666-6666-666666666661',
      });
      expect(data).toBeDefined();
      expect(data.event.id).toBe('66666666-6666-6666-6666-666666666661');
    });

    it('succeeds when volunteer is a leader of the Administration ministry (admin)', async () => {
      await promoteToAdmin('44444444-4444-4444-4444-444444444441');
      const caller = createCaller('22222222-2222-2222-2222-222222222221');
      const data = await caller.adminLeader.getScheduleBuilderData({
        eventId: '66666666-6666-6666-6666-666666666661',
      });
      expect(data).toBeDefined();
      expect(data.event.id).toBe('66666666-6666-6666-6666-666666666661');
    });
  });

  describe('getScheduleBuilderData', () => {
    it('returns structured event, slots, requirements, assignments and availability data', async () => {
      await promoteToLeader(
        '44444444-4444-4444-4444-444444444441',
        '33333333-3333-3333-3333-333333333331',
      );
      const caller = createCaller('22222222-2222-2222-2222-222222222221');
      const data = await caller.adminLeader.getScheduleBuilderData({
        eventId: '66666666-6666-6666-6666-666666666661',
      });

      expect(data.event.title).toBe('Youth Gathering');
      expect(data.slots).toHaveLength(1);
      expect(data.slots[0]?.label).toBe('Morning Service');
      expect(data.requirements).toHaveLength(1);
      expect(data.requirements[0]?.requiredCount).toBe(2);
      expect(data.assignments).toHaveLength(2); // confirmed & declined
      expect(data.assignments.some((a) => a.status === 'confirmed')).toBe(true);
      expect(data.assignments.some((a) => a.status === 'declined')).toBe(true);
      expect(data.volunteerAvailability).toBeDefined();
      // Should have checked availability for the volunteers in the ministry
      expect(data.volunteerAvailability.length).toBeGreaterThan(0);
    });
  });

  describe('upsertSlotRequirement', () => {
    it('creates a new requirement or updates an existing one', async () => {
      await promoteToLeader(
        '44444444-4444-4444-4444-444444444441',
        '33333333-3333-3333-3333-333333333331',
      );
      const caller = createCaller('22222222-2222-2222-2222-222222222221');

      // Update existing requirement (88888888-8888-8888-8888-888888888881)
      const resUpdate = await caller.adminLeader.upsertSlotRequirement({
        timeSlotId: '77777777-7777-7777-7777-777777777771',
        roleId: '55555555-5555-5555-5555-555555555551',
        count: 5,
      });
      expect(resUpdate.requirement.requiredCount).toBe(5);

      // Create new requirement
      const resCreate = await caller.adminLeader.upsertSlotRequirement({
        timeSlotId: '77777777-7777-7777-7777-777777777771',
        roleId: '55555555-5555-5555-5555-555555555552', // Greeter
        count: 3,
      });
      expect(resCreate.requirement.requiredCount).toBe(3);
    });

    it('returns overstaffing warning if count is lower than active assignments', async () => {
      await promoteToLeader(
        '44444444-4444-4444-4444-444444444441',
        '33333333-3333-3333-3333-333333333331',
      );
      const caller = createCaller('22222222-2222-2222-2222-222222222221');

      // Only volunteer-1 has a confirmed (active) assignment. declined does not count as active.
      // Let's create another active assignment to have 2 active assignments.
      await testDb
        .update(assignment)
        .set({ status: 'confirmed' })
        .where(eq(assignment.id, '99999999-9999-9999-9999-999999999992'));

      const res = await caller.adminLeader.upsertSlotRequirement({
        timeSlotId: '77777777-7777-7777-7777-777777777771',
        roleId: '55555555-5555-5555-5555-555555555551',
        count: 1,
      });

      expect(res.warning).toContain(
        'Slot is overstaffed: 2 assignments exist for requirement count 1',
      );
    });
  });

  describe('createAssignment', () => {
    beforeEach(async () => {
      // Clear assignments on Slot 1 to avoid duplicate assignment constraints during tests
      await testDb
        .delete(assignment)
        .where(
          and(
            eq(assignment.slotId, '77777777-7777-7777-7777-777777777771'),
            inArray(assignment.volunteerId, [
              '44444444-4444-4444-4444-444444444441',
              '44444444-4444-4444-4444-444444444442',
            ]),
          ),
        );

      const futureDate = new Date(Date.now() + 365 * 24 * 3600 * 1000);
      const futureEndDate = new Date(futureDate.getTime() + 2 * 3600 * 1000);

      // Make Slot 1 future-dated
      await testDb
        .update(timeSlot)
        .set({
          startTime: futureDate,
          endTime: futureEndDate,
        })
        .where(eq(timeSlot.id, '77777777-7777-7777-7777-777777777771'));

      // Make Slot 2 overlap with Slot 1 (future-dated) to trigger soft DOUBLE_BOOKED conflict on volunteer-1 (who has assignment-3 on Slot 2)
      await testDb
        .update(timeSlot)
        .set({
          startTime: new Date(futureDate.getTime() + 30 * 60 * 1000),
          endTime: new Date(futureEndDate.getTime() + 30 * 60 * 1000),
        })
        .where(eq(timeSlot.id, '77777777-7777-7777-7777-777777777772'));

      // Update event dates as well to match the future slots
      await testDb
        .update(event)
        .set({
          startDate: futureDate,
          endDate: new Date(futureEndDate.getTime() + 2 * 3600 * 1000),
        })
        .where(eq(event.id, '66666666-6666-6666-6666-666666666661'));
    });

    it('creates assignment as draft if asDraft = true', async () => {
      await promoteToLeader(
        '44444444-4444-4444-4444-444444444441',
        '33333333-3333-3333-3333-333333333331',
      );
      const caller = createCaller('22222222-2222-2222-2222-222222222221');

      const res = await caller.adminLeader.createAssignment({
        timeSlotId: '77777777-7777-7777-7777-777777777771',
        volunteerId: '44444444-4444-4444-4444-444444444442',
        roleId: '55555555-5555-5555-5555-555555555551',
        asDraft: true,
      });

      expect(res.assignment).toBeDefined();
      expect(res.assignment?.status).toBe('draft');
    });

    it('returns conflict report on soft conflicts if allowOverride is false or not provided', async () => {
      await promoteToLeader(
        '44444444-4444-4444-4444-444444444441',
        '33333333-3333-3333-3333-333333333331',
      );
      const caller = createCaller('22222222-2222-2222-2222-222222222221');

      // Volunteer 1 is already assigned to slot 1 (confirmed). Assigning them again in slot 1 or another slot during same time should cause a DOUBLE_BOOKED soft conflict.
      const res = await caller.adminLeader.createAssignment({
        timeSlotId: '77777777-7777-7777-7777-777777777771',
        volunteerId: '44444444-4444-4444-4444-444444444441',
        roleId: '55555555-5555-5555-5555-555555555552',
      });

      expect(res.assignment).toBeUndefined();
      expect(res.conflictReport?.hasConflicts).toBe(true);
      expect(res.conflictReport?.issues[0]?.type).toBe('DOUBLE_BOOKED');
    });

    it('successfully overrides soft conflicts and creates pending assignment if allowOverride = true', async () => {
      await promoteToLeader(
        '44444444-4444-4444-4444-444444444441',
        '33333333-3333-3333-3333-333333333331',
      );
      const caller = createCaller('22222222-2222-2222-2222-222222222221');

      const res = await caller.adminLeader.createAssignment({
        timeSlotId: '77777777-7777-7777-7777-777777777771',
        volunteerId: '44444444-4444-4444-4444-444444444441',
        roleId: '55555555-5555-5555-5555-555555555552',
        allowOverride: true,
        overrideReason: 'Required special helper',
      });

      expect(res.assignment).toBeDefined();
      expect(res.assignment?.status).toBe('pending');
    });
  });

  describe('deleteAssignment', () => {
    beforeEach(async () => {
      // Clear volunteer 2 assignment on Slot 1 to avoid duplicate assignment index collision when creating draft assignment
      await testDb
        .delete(assignment)
        .where(
          and(
            eq(assignment.slotId, '77777777-7777-7777-7777-777777777771'),
            eq(assignment.volunteerId, '44444444-4444-4444-4444-444444444442'),
          ),
        );
    });

    it('deletes a draft assignment physically', async () => {
      await promoteToLeader(
        '44444444-4444-4444-4444-444444444441',
        '33333333-3333-3333-3333-333333333331',
      );
      const caller = createCaller('22222222-2222-2222-2222-222222222221');

      // Create draft assignment first
      const draftRes = await caller.adminLeader.createAssignment({
        timeSlotId: '77777777-7777-7777-7777-777777777771',
        volunteerId: '44444444-4444-4444-4444-444444444442',
        roleId: '55555555-5555-5555-5555-555555555551',
        asDraft: true,
      });

      if (!draftRes.assignment) {
        throw new Error('Expected draftRes.assignment to be defined');
      }
      const draftId = draftRes.assignment.id;

      const deleteRes = await caller.adminLeader.deleteAssignment({
        assignmentId: draftId,
      });

      expect(deleteRes.success).toBe(true);
      expect(deleteRes.transition).toBe('deleted');

      // Verify physical deletion
      const rows = await testDb
        .select()
        .from(assignment)
        .where(eq(assignment.id, draftId));
      expect(rows).toHaveLength(0);
    });

    it('cancels a non-draft assignment logically', async () => {
      await promoteToLeader(
        '44444444-4444-4444-4444-444444444441',
        '33333333-3333-3333-3333-333333333331',
      );
      const caller = createCaller('22222222-2222-2222-2222-222222222221');

      const deleteRes = await caller.adminLeader.deleteAssignment({
        assignmentId: '99999999-9999-9999-9999-999999999991', // confirmed in seed
      });

      expect(deleteRes.success).toBe(true);
      expect(deleteRes.transition).toBe('cancelled');

      // Verify logical cancellation
      const [row] = await testDb
        .select()
        .from(assignment)
        .where(eq(assignment.id, '99999999-9999-9999-9999-999999999991'));
      expect(row?.status).toBe('cancelled');
    });
  });

  describe('publishEvent', () => {
    it('publishes event and marks draft assignments as pending', async () => {
      await promoteToLeader(
        '44444444-4444-4444-4444-444444444441',
        '33333333-3333-3333-3333-333333333331',
      );
      const caller = createCaller('22222222-2222-2222-2222-222222222221');

      // In the seed, event-1 (66666666-6666-6666-6666-666666666661) is draft and starts on June 5, 2024.
      // Wait, is it in the future compared to now?
      // Since our utcMiddleware uses new Date(), if we check past event constraint, we must ensure event.startDate is in the future.
      // Let's update event-1 startDate to be in the future (e.g. 1 year from now) so that PastEventError is not thrown.
      const futureDate = new Date(Date.now() + 365 * 24 * 3600 * 1000);
      const futureEndDate = new Date(futureDate.getTime() + 2 * 3600 * 1000);
      await testDb
        .update(timeSlot)
        .set({ startTime: futureDate, endTime: futureEndDate })
        .where(eq(timeSlot.eventId, '66666666-6666-6666-6666-666666666661'));
      await testDb
        .update(event)
        .set({ startDate: futureDate, endDate: futureEndDate })
        .where(eq(event.id, '66666666-6666-6666-6666-666666666661'));

      // Delete existing confirmed assignment to avoid unique index violation
      await testDb
        .delete(assignment)
        .where(eq(assignment.id, '99999999-9999-9999-9999-999999999991'));

      // Also let's create a draft assignment to be published
      await testDb.insert(assignment).values({
        id: '99999999-9999-9999-9999-999999999999',
        churchId: '11111111-1111-1111-1111-111111111111',
        slotId: '77777777-7777-7777-7777-777777777771',
        volunteerId: '44444444-4444-4444-4444-444444444441',
        roleId: '55555555-5555-5555-5555-555555555551',
        status: 'draft',
      });

      const res = await caller.adminLeader.publishEvent({
        eventId: '66666666-6666-6666-6666-666666666661',
      });

      expect(res.success).toBe(true);
      expect(res.transitionedCount).toBe(1);

      // Verify event is published
      const [updatedEvent] = await testDb
        .select()
        .from(event)
        .where(eq(event.id, '66666666-6666-6666-6666-666666666661'));
      expect(updatedEvent?.status).toBe('published');
    });
  });

  describe('cancelEvent', () => {
    it('cancels the event, all slots, and cancels/deletes assignments accordingly', async () => {
      await promoteToLeader(
        '44444444-4444-4444-4444-444444444441',
        '33333333-3333-3333-3333-333333333331',
      );
      const caller = createCaller('22222222-2222-2222-2222-222222222221');

      // Let's cancel event-2 (66666666-6666-6666-6666-666666666662) which is published in the seed.
      const res = await caller.adminLeader.cancelEvent({
        eventId: '66666666-6666-6666-6666-666666666662',
        reason: 'Scheduling conflict',
      });

      expect(res.success).toBe(true);
      expect(res.cancelledAssignmentCount).toBe(1); // slot-2 has assignment-3 which is confirmed and should be cancelled

      const [updatedEvent] = await testDb
        .select()
        .from(event)
        .where(eq(event.id, '66666666-6666-6666-6666-666666666662'));
      expect(updatedEvent?.status).toBe('cancelled');
    });
  });
});
