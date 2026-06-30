import { assignment, event, timeSlot } from '@church/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationService } from '../../../src/infrastructure/services/local-notification-service';
import { seed, testDb, truncateAll } from '../repositories/setup';
import { createCaller, SEED } from './caller';

// Seed assignment-3: volunteer-1 (Alice) on slot-2 of the PUBLISHED event,
// assignedBy user-1. Assignment-1: Alice on slot-1 of the DRAFT event.
const ASSIGNMENT_PUBLISHED = '99999999-9999-9999-9999-999999999993';
const ASSIGNMENT_DRAFT = SEED.assignmentConfirmed;

describe('respondToAssignment — decline notification (T128)', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();

    const draftStart = new Date('2099-01-05T09:00:00Z');
    const draftEnd = new Date('2099-01-05T11:00:00Z');
    const publishedStart = new Date('2099-01-06T09:00:00Z');
    const publishedEnd = new Date('2099-01-06T11:00:00Z');

    await testDb
      .update(event)
      .set({
        startDate: draftStart,
        endDate: draftEnd,
      })
      .where(eq(event.id, SEED.eventDraft));

    await testDb
      .update(timeSlot)
      .set({
        startTime: draftStart,
        endTime: draftEnd,
      })
      .where(eq(timeSlot.id, SEED.slotDraft));

    await testDb
      .update(event)
      .set({
        startDate: publishedStart,
        endDate: publishedEnd,
        status: 'published',
      })
      .where(eq(event.id, SEED.eventPublished));

    await testDb
      .update(timeSlot)
      .set({
        startTime: publishedStart,
        endTime: publishedEnd,
      })
      .where(eq(timeSlot.id, SEED.slotPublished));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('notifies the assigning leader when declining a published-event assignment', async () => {
    const spy = vi
      .spyOn(notificationService, 'notifyLeaderOfDecline')
      .mockResolvedValue(undefined);

    const result = await createCaller(
      SEED.userAlice,
    ).volunteer.respondToAssignment({
      assignmentId: ASSIGNMENT_PUBLISHED,
      response: 'declined',
    });

    expect(result.status).toBe('declined');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      eventId: SEED.eventPublished,
      leaderUserId: SEED.userAlice,
      volunteerId: SEED.volunteerAlice,
    });
  });

  it('does not notify when declining a draft-event assignment', async () => {
    const spy = vi
      .spyOn(notificationService, 'notifyLeaderOfDecline')
      .mockResolvedValue(undefined);

    await createCaller(SEED.userAlice).volunteer.respondToAssignment({
      assignmentId: ASSIGNMENT_DRAFT,
      response: 'declined',
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('does not notify when confirming', async () => {
    const spy = vi
      .spyOn(notificationService, 'notifyLeaderOfDecline')
      .mockResolvedValue(undefined);

    await createCaller(SEED.userAlice).volunteer.respondToAssignment({
      assignmentId: ASSIGNMENT_PUBLISHED,
      response: 'confirmed',
    });

    expect(spy).not.toHaveBeenCalled();
  });

  describe('Permission Failures', () => {
    it('rejects responding to another volunteer’s assignment', async () => {
      await expect(
        createCaller(SEED.userBob).volunteer.respondToAssignment({
          assignmentId: ASSIGNMENT_PUBLISHED,
          response: 'declined',
        }),
      ).rejects.toThrow();
    });

    it('rejects responding once the slot is already in progress', async () => {
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

      await expect(
        createCaller(SEED.userAlice).volunteer.respondToAssignment({
          assignmentId: ASSIGNMENT_PUBLISHED,
          response: 'confirmed',
        }),
      ).rejects.toThrow(
        'This assignment is already in progress and can no longer be updated.',
      );
    });
  });
});
