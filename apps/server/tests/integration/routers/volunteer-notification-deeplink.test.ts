import { assignment, ministry, volunteerNotification } from '@church/db';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed, testDb, truncateAll } from '../repositories/setup';
import { createCaller, SEED } from './caller';

const ALICE_NOTIFICATION_ID = 'f4444444-4444-4444-4444-444444444444' as const;
const ORPHAN_MINISTRY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as const;

describe('volunteer notification deep-link fallback', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
  });

  it('falls back to ministry schedule when original assignment target is gone but the ministry still exists in current context', async () => {
    await testDb
      .delete(assignment)
      .where(
        and(
          eq(assignment.churchId, SEED.church),
          eq(assignment.volunteerId, SEED.volunteerAlice),
        ),
      );

    await testDb.insert(volunteerNotification).values({
      id: ALICE_NOTIFICATION_ID,
      churchId: SEED.church,
      volunteerId: SEED.volunteerAlice,
      ministryId: SEED.ministryAdult,
      eventId: SEED.eventDraft,
      type: 'assignment_changed',
      title: 'Assignment updated',
      body: 'Original assignment moved somewhere else.',
      payload: {
        assignmentId: 'missing-assignment',
        eventId: SEED.eventDraft,
        ministryId: SEED.ministryAdult,
        section: 'assignments',
      },
      createdAt: new Date('2099-01-07T10:00:00Z'),
    });

    const result = await createCaller(
      SEED.userAlice,
    ).volunteer.getMyNotifications({
      limit: 10,
    });

    expect(result.items[0]?.deepLink).toEqual({
      section: 'ministry_schedule',
      ministryId: SEED.ministryAdult,
    });
  });

  it('falls back to notifications when original target no longer exists anywhere in current dashboard context', async () => {
    await testDb
      .delete(assignment)
      .where(
        and(
          eq(assignment.churchId, SEED.church),
          eq(assignment.volunteerId, SEED.volunteerAlice),
        ),
      );

    await testDb.insert(ministry).values({
      id: ORPHAN_MINISTRY_ID,
      churchId: SEED.church,
      enforcementType: 'soft',
      name: 'Orphan Ministry',
    });

    await testDb.insert(volunteerNotification).values({
      id: ALICE_NOTIFICATION_ID,
      churchId: SEED.church,
      volunteerId: SEED.volunteerAlice,
      ministryId: ORPHAN_MINISTRY_ID,
      eventId: SEED.eventPublished,
      type: 'assignment_changed',
      title: 'Assignment updated',
      body: 'Original assignment moved somewhere else.',
      payload: {
        assignmentId: 'missing-assignment',
        eventId: SEED.eventPublished,
        ministryId: ORPHAN_MINISTRY_ID,
        section: 'assignments',
      },
      createdAt: new Date('2099-01-07T10:00:00Z'),
    });

    const result = await createCaller(
      SEED.userAlice,
    ).volunteer.getMyNotifications({
      limit: 10,
    });

    expect(result.items[0]?.deepLink).toEqual({
      section: 'notifications',
    });
  });
});
