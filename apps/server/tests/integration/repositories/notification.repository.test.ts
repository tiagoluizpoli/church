import { randomUUID } from 'node:crypto';
import { ministry, notification } from '@church/db';
import { parseInstant } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, NotificationId, UserId } from '@/domain/branded-ids';
import type { NotificationPayload } from '@/domain/notification-kinds';
import { DrizzleNotificationRepository } from '@/infrastructure/repositories/drizzle-notification.repository';
import { buildUser } from '@/seeds/builders/identity';
import { buildNotification } from '@/seeds/builders/notification';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

const db = schedulingTestDb;
const repo = new DrizzleNotificationRepository({ db });

function invitation({
  ministryId,
  name,
}: {
  ministryId: string;
  name: string;
}): NotificationPayload {
  return {
    kind: 'ministry_invitation',
    data: {
      ministryInvitationId: randomUUID(),
      ministryId,
      ministryName: name,
    },
  };
}

async function seedInboxes() {
  const seed = await seedSchedulingPhase3Base();
  await buildUser({
    db,
    id: 'other-user',
    name: 'Other',
    email: 'other@test.com',
  });
  const owner = {
    userId: UserId.from(seed.adminUserId),
    churchId: ChurchId.from(seed.churchAId),
  };
  return { seed, owner };
}

describe('DrizzleNotificationRepository', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('pages newest first without losing equal-Instant rows', async () => {
    const { seed, owner } = await seedInboxes();
    const sameInstant = parseInstant({ value: '2026-07-01T10:00:00.000Z' });
    for (let i = 0; i < 5; i++) {
      await buildNotification({
        db,
        ...owner,
        createdAt: sameInstant,
        payload: invitation({
          ministryId: seed.ministryAId,
          name: `Same ${i}`,
        }),
      });
    }
    await buildNotification({
      db,
      ...owner,
      createdAt: parseInstant({ value: '2026-07-02T10:00:00.000Z' }),
      payload: invitation({ ministryId: seed.ministryAId, name: 'Newest' }),
    });

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await repo.list({ ...owner, cursor, limit: 2 });
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(new Set(seen).size).toBe(6);
    expect(seen).toHaveLength(6);
    const first = await repo.list({ ...owner, limit: 1 });
    expect(first.items[0]?.payload.data).toMatchObject({
      ministryName: 'Newest',
    });
  });

  it('counts unread across the whole inbox, not only the loaded page', async () => {
    const { seed, owner } = await seedInboxes();
    for (let i = 0; i < 3; i++) {
      await buildNotification({
        db,
        ...owner,
        createdAt: parseInstant({ value: `2026-07-0${i + 1}T10:00:00.000Z` }),
        payload: invitation({ ministryId: seed.ministryAId, name: `N${i}` }),
      });
    }

    const page = await repo.list({ ...owner, limit: 1 });

    expect(page.items).toHaveLength(1);
    expect(await repo.countUnread(owner)).toBe(3);
  });

  it('keeps the first read Instant when read twice and refuses a foreign owner', async () => {
    const { seed, owner } = await seedInboxes();
    const row = await buildNotification({
      db,
      ...owner,
      createdAt: parseInstant({ value: '2026-07-01T10:00:00.000Z' }),
      payload: invitation({ ministryId: seed.ministryAId, name: 'Mine' }),
    });
    const notificationId = NotificationId.from(row.id);

    expect(
      await repo.markRead({
        ...owner,
        userId: UserId.from('other-user'),
        notificationId,
      }),
    ).toBe(false);
    expect(
      await repo.markRead({
        ...owner,
        churchId: ChurchId.from(seed.churchBId),
        notificationId,
      }),
    ).toBe(false);
    expect(await repo.markRead({ ...owner, notificationId })).toBe(true);
    const [first] = await db
      .select()
      .from(notification)
      .where(eq(notification.id, row.id));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await repo.markRead({ ...owner, notificationId })).toBe(true);
    const [second] = await db
      .select()
      .from(notification)
      .where(eq(notification.id, row.id));

    expect(first?.readAt).toBeInstanceOf(Date);
    expect(second?.readAt).toEqual(first?.readAt);
  });

  it('marks all unloaded rows read for the caller in their Church only', async () => {
    const { seed, owner } = await seedInboxes();
    const base = {
      db,
      createdAt: parseInstant({ value: '2026-07-01T10:00:00.000Z' }),
    };
    const payload = invitation({ ministryId: seed.ministryAId, name: 'X' });
    for (let i = 0; i < 3; i++)
      await buildNotification({ ...base, ...owner, payload });
    await buildNotification({
      ...base,
      ...owner,
      churchId: ChurchId.from(seed.churchBId),
      payload,
    });
    await buildNotification({
      ...base,
      ...owner,
      userId: UserId.from('other-user'),
      payload,
    });

    await repo.markAllRead(owner);
    await repo.markAllRead(owner);

    expect(await repo.countUnread(owner)).toBe(0);
    expect(
      await repo.countUnread({
        ...owner,
        churchId: ChurchId.from(seed.churchBId),
      }),
    ).toBe(1);
    expect(
      await repo.countUnread({ ...owner, userId: UserId.from('other-user') }),
    ).toBe(1);
  });

  it('creates idempotently on the source outbox id and never resets read state', async () => {
    const { seed, owner } = await seedInboxes();
    const sourceOutboxId = randomUUID();
    const payload = invitation({ ministryId: seed.ministryAId, name: 'Once' });

    const created = await repo.create({ ...owner, payload, sourceOutboxId });
    await repo.markRead({ ...owner, notificationId: created.id });
    const replay = await repo.create({
      ...owner,
      payload: invitation({ ministryId: seed.ministryAId, name: 'Renamed' }),
      sourceOutboxId,
    });

    expect(replay.id).toBe(created.id);
    expect(replay.payload.data).toMatchObject({ ministryName: 'Once' });
    expect(replay.readAt).toBeDefined();
    expect((await repo.list({ ...owner, limit: 10 })).items).toHaveLength(1);
  });

  it('keeps history when a scheduling object it mentions is deleted', async () => {
    const { seed, owner } = await seedInboxes();
    await buildNotification({
      db,
      ...owner,
      createdAt: parseInstant({ value: '2026-07-01T10:00:00.000Z' }),
      payload: invitation({ ministryId: seed.ministryAId, name: 'Gone soon' }),
    });

    await db.delete(ministry).where(eq(ministry.id, seed.ministryAId));

    expect((await repo.list({ ...owner, limit: 10 })).items).toHaveLength(1);
  });
});
