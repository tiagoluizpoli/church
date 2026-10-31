import { randomUUID } from 'node:crypto';
import { notification, volunteerNotification } from '@church/db';
import { type Instant, toDate } from '@church/time';
import type { NotificationPayload } from '../../src/domain/notification-kinds';
import type { SeedWriter } from '../recipe';
import { requireInsertedRow } from './require-inserted-row';

export type SeededVolunteerNotification =
  typeof volunteerNotification.$inferSelect;
export type VolunteerNotificationType = SeededVolunteerNotification['type'];

export interface BuildVolunteerNotificationInput {
  db: SeedWriter;
  churchId: string;
  volunteerId: string;
  id: string;
  type: VolunteerNotificationType;
  title: string;
  body: string;
  payload: Record<string, string | null>;
  /** Explicit, so a graph never depends on the wall clock at load time. */
  createdAt: Instant;
  ministryId?: string;
  eventId?: string;
  assignmentId?: string;
  /** The Cycle the notification is packaged under. */
  cycleId?: string;
  /** When the Volunteer opened it; absent leaves it unread. */
  readAt?: Instant;
}

/** Direct state by purpose (ADR 0006): an in-app notification of a Volunteer, as left by a schedule change; unread unless `readAt` is given. */
export async function buildVolunteerNotification({
  db,
  churchId,
  volunteerId,
  id,
  type,
  title,
  body,
  payload,
  createdAt,
  ministryId,
  eventId,
  assignmentId,
  cycleId,
  readAt,
}: BuildVolunteerNotificationInput): Promise<SeededVolunteerNotification> {
  return requireInsertedRow({
    rows: await db
      .insert(volunteerNotification)
      .values({
        id,
        churchId,
        volunteerId,
        type,
        title,
        body,
        payload,
        createdAt: toDate({ instant: createdAt }),
        ministryId,
        eventId,
        assignmentId,
        cycleId,
        readAt: readAt === undefined ? undefined : toDate({ instant: readAt }),
      })
      .returning(),
    description: `Volunteer Notification ${id}`,
  });
}

export type SeededNotification = typeof notification.$inferSelect;

export interface BuildNotificationInput {
  db: SeedWriter;
  userId: string;
  churchId: string;
  /** Explicit, so a graph never depends on the wall clock at load time. */
  createdAt: Instant;
  payload: NotificationPayload;
  id?: string;
  /** Defaults to a fresh id; pass one to model a replay of the same outbox row. */
  sourceOutboxId?: string;
  /** When the member opened it; absent leaves it unread. */
  readAt?: Instant;
}

/** Direct state by purpose (ADR 0006): a member's inbox Notification as the inbox sink leaves it; unread unless `readAt` is given. */
export async function buildNotification({
  db,
  userId,
  churchId,
  createdAt,
  payload,
  id,
  sourceOutboxId,
  readAt,
}: BuildNotificationInput): Promise<SeededNotification> {
  return requireInsertedRow({
    rows: await db
      .insert(notification)
      .values({
        id,
        userId,
        churchId,
        kind: payload.kind,
        data: payload.data,
        sourceOutboxId: sourceOutboxId ?? randomUUID(),
        createdAt: toDate({ instant: createdAt }),
        readAt: readAt === undefined ? undefined : toDate({ instant: readAt }),
      })
      .returning(),
    description: `Notification of ${userId} in ${churchId}`,
  });
}
