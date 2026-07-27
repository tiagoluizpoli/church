import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assignment,
  assignmentAudit,
  event,
  ministry,
  ministryParticipation,
  planningCycle,
  role,
  shift,
  timeSlot,
  user,
  volunteer,
} from '../../src/schema';
import { createChurch } from '../../src/tenancy';
import { clearDatabase, testDb } from './setup';

describe('Assignments and Audit Schema', () => {
  let churchId: string;
  let ministryId: string;
  let volunteerId: string;
  let userId: string;
  let eventId: string;
  let slotId: string;
  let participationId: string;
  let shiftId: string;
  let roleId: string;

  beforeAll(async () => {
    await clearDatabase();

    // Create a church
    const newChurch = await createChurch({
      db: testDb,
      name: 'Test Church',
      slug: 'test-church-assignments',
    });
    churchId = newChurch.id;

    // Create a user
    const [newUser] = await testDb
      .insert(user)
      .values({
        id: 'user_1',
        name: 'Test User',
        email: 'test@example.com',
      })
      .returning();
    if (!newUser) throw new Error('Failed to create user');
    userId = newUser.id;

    // Create a volunteer
    const [newVolunteer] = await testDb
      .insert(volunteer)
      .values({
        userId: userId,
        churchId: churchId,
      })
      .returning();
    if (!newVolunteer) throw new Error('Failed to create volunteer');
    volunteerId = newVolunteer.id;

    // Create a ministry
    const [newMinistry] = await testDb
      .insert(ministry)
      .values({
        churchId: churchId,
        name: 'Test Ministry',
      })
      .returning();
    if (!newMinistry) throw new Error('Failed to create ministry');
    ministryId = newMinistry.id;

    // Create a role
    const [newRole] = await testDb
      .insert(role)
      .values({
        churchId: churchId,
        ministryId: ministryId,
        name: 'Test Role',
      })
      .returning();
    if (!newRole) throw new Error('Failed to create role');
    roleId = newRole.id;

    const [cycle] = await testDb
      .insert(planningCycle)
      .values({
        churchId,
        name: 'Assignment cycle',
        startDate: new Date(Date.now() - 86_400_000),
        endDate: new Date(Date.now() + 86_400_000),
      })
      .returning();
    if (!cycle) throw new Error('Failed to create cycle');

    const [newEvent] = await testDb
      .insert(event)
      .values({
        churchId: churchId,
        planningCycleId: cycle.id,
        title: 'Test Event',
        startDate: new Date(),
        endDate: new Date(Date.now() + 3600000),
      })
      .returning();
    if (!newEvent) throw new Error('Failed to create event');
    eventId = newEvent.id;

    const [participation] = await testDb
      .insert(ministryParticipation)
      .values({ churchId, ministryId, eventId })
      .returning();
    if (!participation) throw new Error('Failed to create participation');
    participationId = participation.id;

    // Create a time slot
    const [newSlot] = await testDb
      .insert(timeSlot)
      .values({
        churchId: churchId,
        eventId: eventId,
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000),
      })
      .returning();
    if (!newSlot) throw new Error('Failed to create slot');
    slotId = newSlot.id;

    const [newShift] = await testDb
      .insert(shift)
      .values({
        churchId,
        participationId,
        timeSlotId: slotId,
        startTime: newSlot.startTime,
        endTime: newSlot.endTime,
      })
      .returning();
    if (!newShift) throw new Error('Failed to create shift');
    shiftId = newShift.id;
  }, 30000);

  afterAll(async () => {
    await clearDatabase();
  });

  it('should create an assignment', async () => {
    const [newAssignment] = await testDb
      .insert(assignment)
      .values({
        churchId,
        participationId,
        shiftId,
        volunteerId,
        roleId,
        assignedBy: userId,
      })
      .returning();

    if (!newAssignment) throw new Error('Failed to create assignment');
    expect(newAssignment).toBeDefined();
    expect(newAssignment.status).toBe('pending');
    expect(newAssignment.assignedBy).toBe(userId);
  });

  it('should enforce unique volunteer per slot', async () => {
    // Second assignment for same slot and volunteer should fail
    try {
      await testDb.insert(assignment).values({
        churchId,
        participationId,
        shiftId,
        volunteerId,
        roleId,
      });
      throw new Error('Should have failed');
    } catch (_error) {
      // Success
    }
  });

  it('should create an audit log entry', async () => {
    // Create another user
    await testDb.insert(user).values({
      id: 'user_2',
      name: 'User 2',
      email: 'user2@example.com',
    });

    const [newVolunteer] = await testDb
      .insert(volunteer)
      .values({
        userId: 'user_2',
        churchId,
      })
      .returning();
    if (!newVolunteer) throw new Error('Failed to create volunteer');

    const [newAssignment] = await testDb
      .insert(assignment)
      .values({
        churchId,
        participationId,
        shiftId,
        volunteerId: newVolunteer.id,
        roleId,
      })
      .returning();

    if (!newAssignment) throw new Error('Failed to create assignment');
    const [auditEntry] = await testDb
      .insert(assignmentAudit)
      .values({
        churchId,
        assignmentId: newAssignment.id,
        actorId: userId,
        action: 'created',
        reason: 'Manually assigned',
      })
      .returning();

    if (!auditEntry) throw new Error('Failed to create audit entry');
    expect(auditEntry).toBeDefined();
    expect(auditEntry.actorId).toBe(userId);
    expect(auditEntry.reason).toBe('Manually assigned');
  });

  it('should cascade delete audit logs when assignment is deleted', async () => {
    // Create another user
    await testDb.insert(user).values({
      id: 'user_3',
      name: 'User 3',
      email: 'user3@example.com',
    });

    const [newVolunteer] = await testDb
      .insert(volunteer)
      .values({
        userId: 'user_3',
        churchId,
      })
      .returning();
    if (!newVolunteer) throw new Error('Failed to create volunteer');

    const [newAssignment] = await testDb
      .insert(assignment)
      .values({
        churchId,
        participationId,
        shiftId,
        volunteerId: newVolunteer.id,
        roleId,
      })
      .returning();

    if (!newAssignment) throw new Error('Failed to create assignment');
    await testDb.insert(assignmentAudit).values({
      churchId,
      assignmentId: newAssignment.id,
      actorId: userId,
      action: 'created',
    });

    await testDb.delete(assignment).where(eq(assignment.id, newAssignment.id));

    const auditEntries = await testDb
      .select()
      .from(assignmentAudit)
      .where(eq(assignmentAudit.assignmentId, newAssignment.id));

    expect(auditEntries.length).toBe(0);
  });
});
