import { volunteerNotification } from '@church/db';
import { and, count, desc, eq, isNull, lt } from 'drizzle-orm';
import type {
  ChurchId,
  VolunteerId,
  VolunteerNotificationId,
} from '../../domain/branded-ids';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type {
  CreateVolunteerNotificationInput,
  VolunteerNotificationListInput,
  VolunteerNotificationListResult,
  VolunteerNotificationRepository,
} from '../../domain/contracts/infrastructure/volunteer-notification.repository';
import { mapVolunteerNotification } from '../mappers/volunteer-notification.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

export class DrizzleVolunteerNotificationRepository
  implements VolunteerNotificationRepository
{
  constructor(private readonly db: AnyDrizzleDb) {}

  async create(
    churchId: ChurchId,
    input: CreateVolunteerNotificationInput,
    tx?: TransactionContext,
  ) {
    const [row] = await getClient(this.db, tx)
      .insert(volunteerNotification)
      .values({
        churchId,
        volunteerId: input.volunteerId,
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

  async listByVolunteer(
    churchId: ChurchId,
    input: VolunteerNotificationListInput,
    tx?: TransactionContext,
  ): Promise<VolunteerNotificationListResult> {
    const limit = Math.max(1, input.limit);
    const rows = await getClient(this.db, tx)
      .select()
      .from(volunteerNotification)
      .where(
        and(
          withChurchIsolation(volunteerNotification, churchId),
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

  async countUnread(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<number> {
    const [row] = await getClient(this.db, tx)
      .select({ count: count() })
      .from(volunteerNotification)
      .where(
        and(
          withChurchIsolation(volunteerNotification, churchId),
          eq(volunteerNotification.volunteerId, volunteerId),
          isNull(volunteerNotification.readAt),
        ),
      );

    return row?.count ?? 0;
  }

  async markRead(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    notificationId: VolunteerNotificationId,
    tx?: TransactionContext,
  ): Promise<Date | null> {
    const readAt = new Date();
    const [row] = await getClient(this.db, tx)
      .update(volunteerNotification)
      .set({ readAt })
      .where(
        and(
          eq(volunteerNotification.id, notificationId),
          withChurchIsolation(volunteerNotification, churchId),
          eq(volunteerNotification.volunteerId, volunteerId),
        ),
      )
      .returning({ id: volunteerNotification.id });

    return row ? readAt : null;
  }

  async markAllRead(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<number> {
    const result = await getClient(this.db, tx)
      .update(volunteerNotification)
      .set({ readAt: new Date() })
      .where(
        and(
          withChurchIsolation(volunteerNotification, churchId),
          eq(volunteerNotification.volunteerId, volunteerId),
          isNull(volunteerNotification.readAt),
        ),
      );

    return result.rowCount ?? 0;
  }
}
