import { beforeEach, describe, expect, it } from 'vitest';
import {
  assignment,
  church,
  event,
  ministry,
  role,
  timeSlot,
  user,
  volunteer,
} from '../../src/schema';
import { clearDatabase, testDb } from './setup';

describe('Scheduling and Assignments Integration', () => {
  let churchId: string;
  let ministryId: string;
  let eventId: string;
  let slotId: string;
  let volunteerId: string;
  let roleId: string;
  let userId: string;

  beforeEach(async () => {
    await clearDatabase();

    // Setup hierarchy
    const [insertedChurch] = await testDb
      .insert(church)
      .values({
        name: 'Test Church',
        slug: 'test-church',
      })
      .returning();
    if (!insertedChurch) throw new Error('Church insert failed');
    churchId = insertedChurch.id;

    const [insertedMinistry] = await testDb
      .insert(ministry)
      .values({
        name: 'Worship',
        churchId,
      })
      .returning();
    if (!insertedMinistry) throw new Error('Ministry insert failed');
    ministryId = insertedMinistry.id;

    const [insertedEvent] = await testDb
      .insert(event)
      .values({
        churchId,
        ministryId,
        title: 'Sunday Service',
        startDate: new Date('2026-05-10T09:00:00Z'),
        endDate: new Date('2026-05-10T12:00:00Z'),
      })
      .returning();
    if (!insertedEvent) throw new Error('Event insert failed');
    eventId = insertedEvent.id;

    const [insertedSlot] = await testDb
      .insert(timeSlot)
      .values({
        churchId,
        eventId,
        startTime: new Date('2026-05-10T09:00:00Z'),
        endTime: new Date('2026-05-10T10:30:00Z'),
        label: 'First Service',
      })
      .returning();
    if (!insertedSlot) throw new Error('Slot insert failed');
    slotId = insertedSlot.id;

    // Need a user for volunteer
    userId = 'user_123';
    await testDb.insert(user).values({
      id: userId,
      name: 'John Doe',
      email: 'john@example.com',
    });

    const [insertedVolunteer] = await testDb
      .insert(volunteer)
      .values({
        churchId,
        userId,
      })
      .returning();
    if (!insertedVolunteer) throw new Error('Volunteer insert failed');
    volunteerId = insertedVolunteer.id;

    const [insertedRole] = await testDb
      .insert(role)
      .values({
        churchId,
        ministryId,
        name: 'Musician',
      })
      .returning();
    if (!insertedRole) throw new Error('Role insert failed');
    roleId = insertedRole.id;
  });

  it('should verify TimeSlot precision and persistence', async () => {
    const startTime = new Date('2026-05-10T09:00:00.123Z');
    const endTime = new Date('2026-05-10T10:30:00.456Z');

    const [inserted] = await testDb
      .insert(timeSlot)
      .values({
        churchId,
        eventId,
        startTime,
        endTime,
      })
      .returning();
    if (!inserted) throw new Error('Slot insert failed');

    expect(inserted.startTime.toISOString()).toBe(startTime.toISOString());
    expect(inserted.endTime.toISOString()).toBe(endTime.toISOString());
  });

  it('should enforce concurrent assignment unique constraint', async () => {
    const assignment1 = {
      churchId,
      slotId,
      volunteerId,
      roleId,
      status: 'pending' as const,
    };

    const assignment2 = {
      churchId,
      slotId,
      volunteerId,
      roleId, // Same volunteer, same slot
      status: 'pending' as const,
    };

    await testDb.insert(assignment).values(assignment1);
    await expect(
      testDb.insert(assignment).values(assignment2),
    ).rejects.toThrow();
  });
});
