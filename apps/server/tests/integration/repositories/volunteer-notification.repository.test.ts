import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChurchId,
  VolunteerId,
  VolunteerNotificationId,
} from '../../../src/domain/branded-ids';
import { DrizzleVolunteerNotificationRepository } from '../../../src/infrastructure/repositories/drizzle-volunteer-notification.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

describe('DrizzleVolunteerNotificationRepository', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('create persists with nullable optional fields defaulted and mapped back as undefined', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleVolunteerNotificationRepository({
      db: schedulingTestDb,
    });
    const churchId = ChurchId.from(seed.churchAId);
    const volunteerId = VolunteerId.from(seed.adminVolunteerId);

    const created = await repo.create(churchId, {
      volunteerId,
      type: 'schedule_published',
      title: 'Schedule published',
      body: 'Your schedule is ready',
      payload: {},
    });

    expect(created.planningCycleId).toBeUndefined();
    expect(created.ministryId).toBeUndefined();
    expect(created.eventId).toBeUndefined();
    expect(created.assignmentId).toBeUndefined();
    expect(created.readAt).toBeUndefined();
    expect(created.volunteerId).toBe(seed.adminVolunteerId);
  });

  it('listByVolunteer orders desc by createdAt, paginates with cursor, and reports hasMore via nextCursor', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleVolunteerNotificationRepository({
      db: schedulingTestDb,
    });
    const churchId = ChurchId.from(seed.churchAId);
    const volunteerId = VolunteerId.from(seed.adminVolunteerId);

    for (let i = 0; i < 3; i++) {
      await repo.create(churchId, {
        volunteerId,
        type: 'assignment_added',
        title: `Notification ${i}`,
        body: 'body',
        payload: {},
      });
    }

    const firstPage = await repo.listByVolunteer(churchId, {
      volunteerId,
      limit: 2,
    });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeDefined();
    expect(firstPage.items[0]?.title).toBe('Notification 2');

    const secondPage = await repo.listByVolunteer(churchId, {
      volunteerId,
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeUndefined();
    expect(secondPage.items[0]?.title).toBe('Notification 0');
  });

  it('listByVolunteer clamps a non-positive limit to at least 1', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleVolunteerNotificationRepository({
      db: schedulingTestDb,
    });
    const churchId = ChurchId.from(seed.churchAId);
    const volunteerId = VolunteerId.from(seed.adminVolunteerId);

    await repo.create(churchId, {
      volunteerId,
      type: 'assignment_added',
      title: 'Only one',
      body: 'body',
      payload: {},
    });

    const page = await repo.listByVolunteer(churchId, {
      volunteerId,
      limit: 0,
    });
    expect(page.items).toHaveLength(1);
  });

  it('countUnread counts only unread rows and markRead/markAllRead update readAt', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleVolunteerNotificationRepository({
      db: schedulingTestDb,
    });
    const churchId = ChurchId.from(seed.churchAId);
    const volunteerId = VolunteerId.from(seed.adminVolunteerId);

    const n1 = await repo.create(churchId, {
      volunteerId,
      type: 'assignment_added',
      title: 'One',
      body: 'body',
      payload: {},
    });
    await repo.create(churchId, {
      volunteerId,
      type: 'assignment_added',
      title: 'Two',
      body: 'body',
      payload: {},
    });

    expect(await repo.countUnread(churchId, volunteerId)).toBe(2);

    const readAt = await repo.markRead(churchId, volunteerId, n1.id);
    expect(readAt).toBeInstanceOf(Date);
    expect(await repo.countUnread(churchId, volunteerId)).toBe(1);

    // Marking an unknown notification returns null.
    const missing = await repo.markRead(
      churchId,
      volunteerId,
      VolunteerNotificationId.from('99999999-9999-4999-8999-999999999999'),
    );
    expect(missing).toBeNull();

    const updatedCount = await repo.markAllRead(churchId, volunteerId);
    expect(updatedCount).toBe(1);
    expect(await repo.countUnread(churchId, volunteerId)).toBe(0);

    // Nothing left to mark; rowCount is 0.
    expect(await repo.markAllRead(churchId, volunteerId)).toBe(0);
  });

  it('countUnread and markAllRead return 0 when there are no notifications at all', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleVolunteerNotificationRepository({
      db: schedulingTestDb,
    });
    const churchId = ChurchId.from(seed.churchAId);
    const volunteerId = VolunteerId.from(seed.adminVolunteerId);

    expect(await repo.countUnread(churchId, volunteerId)).toBe(0);
    expect(await repo.markAllRead(churchId, volunteerId)).toBe(0);
  });
});
