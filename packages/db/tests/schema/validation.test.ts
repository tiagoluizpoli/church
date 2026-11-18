import { beforeEach, describe, expect, it } from 'vitest';
import {
  assignment,
  cycle,
  event,
  eventTimeBlock,
  ministry,
  ministryParticipation,
  role,
  sector,
  shift,
  shiftRequirement,
  user,
  volunteer,
} from '../../src/schema';
import { createChurch } from '../../src/tenancy';
import { clearDatabase, testDb } from './setup';

describe('Database Level Constraints (T035)', () => {
  let churchId: string;
  let ministryId: string;
  let eventId: string;
  let roleId: string;
  let volunteerId: string;
  let participationId: string;
  let shiftId: string;
  let shiftRequirementId: string;

  beforeEach(async () => {
    await clearDatabase();

    // Setup basic hierarchy
    const insertedChurch = await createChurch({
      db: testDb,
      name: 'Constraint Test Church',
      slug: 'constraint-test',
    });
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

    const [cycleRow] = await testDb
      .insert(cycle)
      .values({
        churchId,
        name: 'Constraint cycle',
        startDate: new Date('2026-05-01T00:00:00Z'),
        endDate: new Date('2026-06-01T00:00:00Z'),
      })
      .returning();
    if (!cycleRow) throw new Error('Cycle insert failed');

    const [insertedEvent] = await testDb
      .insert(event)
      .values({
        churchId,
        cycleId: cycleRow.id,
        title: 'Constraint Event',
        start: new Date('2026-05-10T09:00:00Z'),
        end: new Date('2026-05-10T12:00:00Z'),
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

    const [eventTimeBlockRow] = await testDb
      .insert(eventTimeBlock)
      .values({
        churchId,
        eventId,
        startTime: new Date('2026-05-10T09:00:00Z'),
        endTime: new Date('2026-05-10T10:00:00Z'),
      })
      .returning();
    if (!eventTimeBlockRow) throw new Error('Event time block insert failed');
    const [insertedShift] = await testDb
      .insert(shift)
      .values({
        churchId,
        participationId,
        eventTimeBlockId: eventTimeBlockRow.id,
        startTime: eventTimeBlockRow.startTime,
        endTime: eventTimeBlockRow.endTime,
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
    const [insertedSector] = await testDb
      .insert(sector)
      .values({ churchId, ministryId, name: 'General' })
      .returning();
    if (!insertedSector) throw new Error('Sector insert failed');
    const [insertedRequirement] = await testDb
      .insert(shiftRequirement)
      .values({
        churchId,
        participationId,
        shiftId,
        roleId,
        sectorId: insertedSector.id,
        peopleNeeded: 1,
      })
      .returning();
    if (!insertedRequirement) throw new Error('Requirement insert failed');
    shiftRequirementId = insertedRequirement.id;

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

  describe('EventTimeBlock Constraints', () => {
    it('should prevent EventTimeBlock with negative duration', async () => {
      let failed = false;
      try {
        await testDb.insert(eventTimeBlock).values({
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

    it('should prevent EventTimeBlock with zero duration', async () => {
      let failed = false;
      try {
        await testDb.insert(eventTimeBlock).values({
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

  describe('ShiftRequirement Constraints', () => {
    it('should prevent ShiftRequirement with peopleNeeded < 1', async () => {
      let failed = false;
      const [stage] = await testDb
        .insert(sector)
        .values({ churchId, ministryId, name: 'Stage' })
        .returning();
      if (!stage) throw new Error('Sector seed failed');
      try {
        await testDb.insert(shiftRequirement).values({
          churchId,
          participationId,
          shiftId,
          roleId,
          sectorId: stage.id,
          peopleNeeded: 0,
        });
      } catch (_error: unknown) {
        failed = true;
      }
      expect(failed, 'Should have failed with min people needed check').toBe(
        true,
      );
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
          shiftRequirementId,
          status: 'invalid_status',
        });
      } catch (_error: unknown) {
        failed = true;
      }
      expect(failed, 'Should have failed with status enum check').toBe(true);
    });
  });
});
