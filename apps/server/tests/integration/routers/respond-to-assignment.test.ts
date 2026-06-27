import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationService } from '../../../src/infrastructure/services/local-notification-service';
import { seed, truncateAll } from '../repositories/setup';
import { createCaller, SEED } from './caller';

// Seed assignment-3: volunteer-1 (Alice) on slot-2 of the PUBLISHED event,
// assignedBy user-1. Assignment-1: Alice on slot-1 of the DRAFT event.
const ASSIGNMENT_PUBLISHED = '99999999-9999-9999-9999-999999999993';
const ASSIGNMENT_DRAFT = SEED.assignmentConfirmed;

describe('respondToAssignment — decline notification (T128)', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
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
  });
});
