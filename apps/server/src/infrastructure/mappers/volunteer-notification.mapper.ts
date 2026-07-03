import type { volunteerNotification } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  AssignmentId,
  ChurchId,
  EventId,
  MinistryId,
  PlanningCycleId,
  VolunteerId,
  VolunteerNotificationId,
} from '../../domain/branded-ids';
import type {
  VolunteerNotificationPayload,
  VolunteerNotificationProps,
  VolunteerNotificationType,
} from '../../domain/entities/volunteer-notification';
import { VolunteerNotification } from '../../domain/entities/volunteer-notification';

type VolunteerNotificationRow = InferSelectModel<typeof volunteerNotification>;

export function mapVolunteerNotification(
  row: VolunteerNotificationRow,
): VolunteerNotification {
  const props: VolunteerNotificationProps = {
    churchId: row.churchId as ChurchId,
    volunteerId: row.volunteerId as VolunteerId,
    planningCycleId: (row.planningCycleId ?? undefined) as
      | PlanningCycleId
      | undefined,
    ministryId: (row.ministryId ?? undefined) as MinistryId | undefined,
    eventId: (row.eventId ?? undefined) as EventId | undefined,
    assignmentId: (row.assignmentId ?? undefined) as AssignmentId | undefined,
    type: row.type as VolunteerNotificationType,
    title: row.title,
    body: row.body,
    payload: row.payload as VolunteerNotificationPayload,
    readAt: row.readAt ?? undefined,
    createdAt: row.createdAt,
  };

  return new VolunteerNotification(props, row.id as VolunteerNotificationId);
}
