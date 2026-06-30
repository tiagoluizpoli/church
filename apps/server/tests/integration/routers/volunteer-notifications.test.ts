import { assignment, event, timeSlot, volunteerNotification } from '@church/db';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed, testDb, truncateAll } from '../repositories/setup';
import { createCaller, promoteToLeader, SEED } from './caller';

const ASSIGNMENT_PUBLISHED = '99999999-9999-9999-9999-999999999993';
const ALICE_NOTIFICATION_ID = 'f1111111-1111-1111-1111-111111111111' as const;
const ALICE_OLDER_NOTIFICATION_ID =
  'f2222222-2222-2222-2222-222222222222' as const;
const BOB_NOTIFICATION_ID = 'f3333333-3333-3333-3333-333333333333' as const;

async function makeVolunteerEventsFuture(): Promise<void> {
  const draftStart = new Date('2099-01-05T09:00:00Z');
  const draftEnd = new Date('2099-01-05T11:00:00Z');
  const publishedStart = new Date('2099-01-06T09:00:00Z');
  const publishedEnd = new Date('2099-01-06T11:00:00Z');

  await testDb
    .update(event)
    .set({
      startDate: draftStart,
      endDate: draftEnd,
      status: 'draft',
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
}

describe('volunteer notifications inbox', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
    await makeVolunteerEventsFuture();
  });

  it('returns route-generated scheduling notifications with explicit changed and removed wording', async () => {
    await promoteToLeader(SEED.volunteerAlice, SEED.ministryAdult);

    await testDb
      .update(assignment)
      .set({ status: 'draft' })
      .where(eq(assignment.id, SEED.assignmentConfirmed));

    await createCaller(SEED.userAlice).adminLeader.publishEvent({
      eventId: SEED.eventDraft,
    });

    await createCaller(SEED.userAlice).volunteer.respondToAssignment({
      assignmentId: SEED.assignmentConfirmed,
      response: 'confirmed',
    });

    await createCaller(SEED.userAlice).volunteer.respondToAssignment({
      assignmentId: ASSIGNMENT_PUBLISHED,
      response: 'declined',
    });

    const result = await createCaller(
      SEED.userAlice,
    ).volunteer.getMyNotifications({
      limit: 10,
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'schedule_published',
          title: 'Schedule published',
          deepLink: expect.objectContaining({
            section: 'assignments',
            eventId: SEED.eventDraft,
            assignmentId: SEED.assignmentConfirmed,
          }),
        }),
        expect.objectContaining({
          type: 'assignment_changed',
          title: 'Assignment updated',
          body: expect.stringContaining('changed from pending to confirmed'),
        }),
        expect.objectContaining({
          type: 'assignment_removed',
          title: 'Assignment removed',
          body: expect.stringContaining('no longer scheduled'),
        }),
      ]),
    );
  });

  it('supports paging, per-item read state, mark-all, and owner isolation', async () => {
    await testDb.insert(volunteerNotification).values([
      {
        id: ALICE_NOTIFICATION_ID,
        churchId: SEED.church,
        volunteerId: SEED.volunteerAlice,
        ministryId: SEED.ministryAdult,
        eventId: SEED.eventPublished,
        assignmentId: ASSIGNMENT_PUBLISHED,
        type: 'assignment_changed',
        title: 'Assignment updated',
        body: 'Your assignment moved to a new slot.',
        payload: {
          assignmentId: ASSIGNMENT_PUBLISHED,
          eventId: SEED.eventPublished,
          ministryId: SEED.ministryAdult,
          section: 'assignments',
        },
        createdAt: new Date('2099-01-07T10:00:00Z'),
      },
      {
        id: ALICE_OLDER_NOTIFICATION_ID,
        churchId: SEED.church,
        volunteerId: SEED.volunteerAlice,
        ministryId: SEED.ministryAdult,
        eventId: SEED.eventDraft,
        type: 'availability_reminder',
        title: 'Availability reminder',
        body: 'Please share your availability.',
        payload: {
          eventId: SEED.eventDraft,
          ministryId: SEED.ministryAdult,
          section: 'availability',
        },
        createdAt: new Date('2099-01-06T10:00:00Z'),
      },
      {
        id: BOB_NOTIFICATION_ID,
        churchId: SEED.church,
        volunteerId: SEED.volunteerBob,
        ministryId: SEED.ministryAdult,
        eventId: SEED.eventPublished,
        type: 'assignment_reminder',
        title: 'Assignment reminder',
        body: 'Remember your upcoming slot.',
        payload: {
          eventId: SEED.eventPublished,
          ministryId: SEED.ministryAdult,
          section: 'assignments',
        },
        createdAt: new Date('2099-01-08T10:00:00Z'),
      },
    ]);

    const firstPage = await createCaller(
      SEED.userAlice,
    ).volunteer.getMyNotifications({
      limit: 1,
    });

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]?.id).toBe(ALICE_NOTIFICATION_ID);
    expect(firstPage.nextCursor).toBe('2099-01-07T10:00:00.000Z');

    const secondPage = await createCaller(
      SEED.userAlice,
    ).volunteer.getMyNotifications({
      cursor: firstPage.nextCursor,
      limit: 1,
    });

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).toBe(ALICE_OLDER_NOTIFICATION_ID);

    const markReadResult = await createCaller(
      SEED.userAlice,
    ).volunteer.markNotificationRead({
      notificationId: ALICE_NOTIFICATION_ID,
    });

    expect(markReadResult.readAt).toBeDefined();

    await expect(
      createCaller(SEED.userBob).volunteer.markNotificationRead({
        notificationId: ALICE_OLDER_NOTIFICATION_ID,
      }),
    ).rejects.toThrow(/notification not found/i);

    const markAllResult = await createCaller(
      SEED.userAlice,
    ).volunteer.markAllNotificationsRead();

    expect(markAllResult.updatedCount).toBe(1);

    const afterRead = await createCaller(
      SEED.userAlice,
    ).volunteer.getMyNotifications({
      limit: 10,
    });

    expect(afterRead.items.every((item) => item.readAt)).toBe(true);

    const bobNotifications = await createCaller(
      SEED.userBob,
    ).volunteer.getMyNotifications({
      limit: 10,
    });

    expect(bobNotifications.items).toHaveLength(1);
    expect(bobNotifications.items[0]?.id).toBe(BOB_NOTIFICATION_ID);
    expect(bobNotifications.items[0]?.readAt).toBeUndefined();
  });

  it('maps stale notification links to current dashboard context and exposes snapshot preview metadata', async () => {
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

    const notifications = await createCaller(
      SEED.userAlice,
    ).volunteer.getMyNotifications({
      limit: 10,
    });

    expect(notifications.items[0]?.deepLink).toEqual({
      section: 'availability',
      eventId: SEED.eventDraft,
    });

    const dashboard = await createCaller(
      SEED.userAlice,
    ).volunteer.getVolunteerDashboard();

    expect(dashboard.notificationUnreadCount).toBe(1);
    expect(dashboard.notificationPreview).toEqual([
      expect.objectContaining({
        id: ALICE_NOTIFICATION_ID,
        title: 'Assignment updated',
      }),
    ]);
  });
});
