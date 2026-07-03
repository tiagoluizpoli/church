import { beforeEach, describe, expect, it } from 'vitest';
import {
  assignment,
  church,
  event,
  ministry,
  ministryParticipation,
  planningCycle,
  role,
  shift,
  slotRequirement,
  timeSlot,
  user,
  volunteer,
} from '../../src/schema';
import { clearDatabase, testDb } from './setup';

describe('Database Level Constraints (T035)', () => {
  let churchId: string;
  let ministryId: string;
  let eventId: string;
  let roleId: string;
  let volunteerId: string;
  let participationId: string;
  let shiftId: string;

  beforeEach(async () => {
    await clearDatabase();

    // Setup basic hierarchy
    const [insertedChurch] = await testDb
      .insert(church)
      .values({
        name: 'Constraint Test Church',
        slug: 'constraint-test',
      })
      .returning();
    if (!insertedChurch) throw new Error('Church insert failed');
    churchId = insertedChurch.id;

    const [insertedMinistry] = await testDb
      .insert(ministry)
      .values({
        name: 'Constraint Ministry',
        churchId,
      })
      .returning();
    if (!insertedMinistry) throw new Error('Ministry insert failed');
    ministryId = insertedMinistry.id;

    const [cycle] = await testDb
      .insert(planningCycle)
      .values({
        churchId,
        name: 'Constraint cycle',
        startDate: new Date('2026-05-01T00:00:00Z'),
        endDate: new Date('2026-06-01T00:00:00Z'),
      })
      .returning();
    if (!cycle) throw new Error('Cycle insert failed');

    const [insertedEvent] = await testDb
      .insert(event)
      .values({
        churchId,
        planningCycleId: cycle.id,
        title: 'Constraint Event',
        startDate: new Date('2026-05-10T09:00:00Z'),
        endDate: new Date('2026-05-10T12:00:00Z'),
      })
      .returning();
    if (!insertedEvent) throw new Error('Event insert failed');
    eventId = insertedEvent.id;

    const [participation] = await testDb
      .insert(ministryParticipation)
      .values({ churchId, ministryId, eventId })
      .returning();
    if (!participation) throw new Error('Participation insert failed');
    participationId = participation.id;

    const [slot] = await testDb
      .insert(timeSlot)
      .values({
        churchId,
        eventId,
        startTime: new Date('2026-05-10T09:00:00Z'),
        endTime: new Date('2026-05-10T10:00:00Z'),
      })
      .returning();
    if (!slot) throw new Error('Slot insert failed');
    const [insertedShift] = await testDb
      .insert(shift)
      .values({
        churchId,
        participationId,
        timeSlotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
      })
      .returning();
    if (!insertedShift) throw new Error('Shift insert failed');
    shiftId = insertedShift.id;

    const [insertedRole] = await testDb
      .insert(role)
      .values({
        churchId,
        ministryId,
        name: 'Constraint Role',
      })
      .returning();
    if (!insertedRole) throw new Error('Role insert failed');
    roleId = insertedRole.id;

    await testDb.insert(user).values({
      id: 'user_constraint',
      name: 'Constraint User',
      email: 'constraint@example.com',
    });

    const [insertedVolunteer] = await testDb
      .insert(volunteer)
      .values({
        churchId,
        userId: 'user_constraint',
      })
      .returning();
    if (!insertedVolunteer) throw new Error('Volunteer insert failed');
    volunteerId = insertedVolunteer.id;
  });

  describe('TimeSlot Constraints', () => {
    it('should prevent TimeSlot with negative duration', async () => {
      let failed = false;
      try {
        await testDb.insert(timeSlot).values({
          churchId,
          eventId,
          startTime: new Date('2026-05-10T10:00:00Z'),
          endTime: new Date('2026-05-10T09:00:00Z'),
        });
      } catch (_error: unknown) {
        failed = true;
      }
      expect(failed, 'Should have failed with duration check').toBe(true);
    });

    it('should prevent TimeSlot with zero duration', async () => {
      let failed = false;
      try {
        await testDb.insert(timeSlot).values({
          churchId,
          eventId,
          startTime: new Date('2026-05-10T09:00:00Z'),
          endTime: new Date('2026-05-10T09:00:00Z'),
        });
      } catch (_error: unknown) {
        failed = true;
      }
      expect(failed, 'Should have failed with zero duration check').toBe(true);
    });
  });

  describe('SlotRequirement Constraints', () => {
    it('should prevent SlotRequirement with requiredCount < 1', async () => {
      let failed = false;
      try {
        await testDb.insert(slotRequirement).values({
          churchId,
          participationId,
          shiftId,
          roleId,
          requiredCount: 0,
        });
      } catch (_error: unknown) {
        failed = true;
      }
      expect(failed, 'Should have failed with min count check').toBe(true);
    });
  });

  describe('Assignment Status Constraints', () => {
    it('should only allow valid status values', async () => {
      let failed = false;
      try {
        // @ts-expect-error
        await testDb.insert(assignment).values({
          churchId,
          participationId,
          shiftId,
          volunteerId,
          roleId,
          status: 'invalid_status',
        });
      } catch (_error: unknown) {
        failed = true;
      }
      expect(failed, 'Should have failed with status enum check').toBe(true);
    });
  });
});
