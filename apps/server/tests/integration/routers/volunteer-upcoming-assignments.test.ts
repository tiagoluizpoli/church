import { assignment, event, timeSlot } from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed, testDb, truncateAll } from '../repositories/setup';
import { createCaller, SEED } from './caller';

const ASSIGNMENT_PUBLISHED = '99999999-9999-9999-9999-999999999993';

describe('getMyUpcomingAssignments', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
  });

  it('returns grouped published assignments for the current volunteer', async () => {
    const eventStart = new Date('2099-01-06T09:00:00Z');
    const eventEnd = new Date('2099-01-06T12:00:00Z');

    await testDb
      .update(event)
      .set({
        startDate: eventStart,
        endDate: eventEnd,
        status: 'published',
      })
      .where(eq(event.id, SEED.eventPublished));

    await testDb
      .update(timeSlot)
      .set({
        startTime: eventStart,
        endTime: eventEnd,
      })
      .where(eq(timeSlot.id, SEED.slotPublished));

    await testDb
      .update(assignment)
      .set({ status: 'pending' })
      .where(eq(assignment.id, ASSIGNMENT_PUBLISHED));

    const result = await createCaller(
      SEED.userAlice,
    ).volunteer.getMyUpcomingAssignments();

    expect(result).toEqual([
      {
        eventId: SEED.eventPublished,
        eventTitle: 'Adult Service',
        ministryId: SEED.ministryAdult,
        ministryName: 'Adult Ministry',
        eventStart: eventStart.toISOString(),
        aggregateResponseState: 'pending',
        hasPendingResponse: true,
        assignments: [
          {
            assignmentId: ASSIGNMENT_PUBLISHED,
            slotId: SEED.slotPublished,
            roleId: SEED.roleUsher,
            roleName: 'Usher',
            startTime: eventStart.toISOString(),
            endTime: eventEnd.toISOString(),
            status: 'pending',
            timingState: 'upcoming',
            canRespond: true,
          },
        ],
      },
    ]);
  });

  it('keeps in-progress assignments visible but not actionable', async () => {
    const now = new Date();
    const slotStart = new Date(now.getTime() - 30 * 60 * 1000);
    const slotEnd = new Date(now.getTime() + 30 * 60 * 1000);

    await testDb
      .update(event)
      .set({
        startDate: slotStart,
        endDate: slotEnd,
        status: 'published',
      })
      .where(eq(event.id, SEED.eventPublished));

    await testDb
      .update(timeSlot)
      .set({
        startTime: slotStart,
        endTime: slotEnd,
      })
      .where(eq(timeSlot.id, SEED.slotPublished));

    await testDb
      .update(assignment)
      .set({ status: 'pending' })
      .where(eq(assignment.id, ASSIGNMENT_PUBLISHED));

    const result = await createCaller(
      SEED.userAlice,
    ).volunteer.getMyUpcomingAssignments();

    expect(result[0]?.assignments[0]).toMatchObject({
      assignmentId: ASSIGNMENT_PUBLISHED,
      timingState: 'in_progress',
      canRespond: false,
      status: 'pending',
    });
    expect(result[0]?.hasPendingResponse).toBe(true);
  });
});
