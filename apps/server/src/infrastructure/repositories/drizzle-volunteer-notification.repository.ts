import { volunteerNotification } from '@church/db';
import { nowAsDate } from '@church/time';
import { and, count, desc, eq, isNull, lt } from 'drizzle-orm';
import type {
  CountUnreadVolunteerNotificationsInput,
  CreateVolunteerNotificationInput,
  MarkAllVolunteerNotificationsReadInput,
  MarkVolunteerNotificationReadInput,
  VolunteerNotificationListInput,
  VolunteerNotificationListResult,
  VolunteerNotificationRepository,
} from '../../domain/contracts/infrastructure/volunteer-notification.repository';
import { mapVolunteerNotification } from '../mappers/volunteer-notification.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleVolunteerNotificationRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleVolunteerNotificationRepository
  implements VolunteerNotificationRepository
{
  constructor({ db }: DrizzleVolunteerNotificationRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async create({ churchId, tx, ...input }: CreateVolunteerNotificationInput) {
    const [row] = await getClient({ db: this.db, tx })
      .insert(volunteerNotification)
      .values({
        churchId,
        volunteerId: input.volunteerId,
        cycleId: input.cycleId ?? null,
        ministryId: input.ministryId ?? null,
        eventId: input.eventId ?? null,
        assignmentId: input.assignmentId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload,
      })
      .returning();

    if (!row) {
      throw new Error('Volunteer notification insert failed');
    }

    return mapVolunteerNotification(row);
  }

  async listByVolunteer({
    churchId,
    tx,
    ...input
  }: VolunteerNotificationListInput): Promise<VolunteerNotificationListResult> {
    const limit = Math.max(1, input.limit);
    const rows = await getClient({ db: this.db, tx })
      .select()
      .from(volunteerNotification)
      .where(
        and(
          withChurchIsolation({ table: volunteerNotification, churchId }),
          eq(volunteerNotification.volunteerId, input.volunteerId),
          input.cursor
            ? lt(volunteerNotification.createdAt, input.cursor)
            : undefined,
        ),
      )
      .orderBy(desc(volunteerNotification.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(mapVolunteerNotification);
    const lastItem = items.at(-1);

    return {
      items,
      nextCursor: hasMore ? lastItem?.createdAt : undefined,
    };
  }

  async countUnread({
    churchId,
    volunteerId,
    tx,
  }: CountUnreadVolunteerNotificationsInput): Promise<number> {
    const [row] = await getClient({ db: this.db, tx })
      .select({ count: count() })
      .from(volunteerNotification)
      .where(
        and(
          withChurchIsolation({ table: volunteerNotification, churchId }),
          eq(volunteerNotification.volunteerId, volunteerId),
          isNull(volunteerNotification.readAt),
        ),
      );

    return row?.count ?? 0;
  }

  async markRead({
    churchId,
    volunteerId,
    notificationId,
    tx,
  }: MarkVolunteerNotificationReadInput): Promise<Date | null> {
    const readAt = nowAsDate();
    const [row] = await getClient({ db: this.db, tx })
      .update(volunteerNotification)
      .set({ readAt })
      .where(
        and(
          eq(volunteerNotification.id, notificationId),
          withChurchIsolation({ table: volunteerNotification, churchId }),
          eq(volunteerNotification.volunteerId, volunteerId),
        ),
      )
      .returning({ id: volunteerNotification.id });

    return row ? readAt : null;
  }

  async markAllRead({
    churchId,
    volunteerId,
    tx,
  }: MarkAllVolunteerNotificationsReadInput): Promise<number> {
    const result = await getClient({ db: this.db, tx })
      .update(volunteerNotification)
      .set({ readAt: nowAsDate() })
      .where(
        and(
          withChurchIsolation({ table: volunteerNotification, churchId }),
          eq(volunteerNotification.volunteerId, volunteerId),
          isNull(volunteerNotification.readAt),
        ),
      );

    return result.rowCount ?? 0;
  }
}
