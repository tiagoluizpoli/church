import { volunteerNotification } from '@church/db';
import { type Instant, toDate } from '@church/time';
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
}

/** Direct state by purpose (ADR 0006): an unread in-app notification of a Volunteer, as left by a schedule change. */
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
      })
      .returning(),
    description: `Volunteer Notification ${id}`,
  });
}
