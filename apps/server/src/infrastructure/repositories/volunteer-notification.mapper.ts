import type { AssignmentId } from '../../domain/entities/assignment';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { MinistryId } from '../../domain/entities/ministry';
import type { VolunteerId } from '../../domain/entities/volunteer';
import type {
  VolunteerNotificationId,
  VolunteerNotificationPayload,
  VolunteerNotificationProps,
  VolunteerNotificationType,
} from '../../domain/entities/volunteer-notification';
import {
  VOLUNTEER_NOTIFICATION_TYPE_OPTIONS,
  VolunteerNotification,
} from '../../domain/entities/volunteer-notification';
import { assertEnum } from './mapper-utils';

interface VolunteerNotificationRow {
  id: string;
  churchId: string;
  volunteerId: string;
  ministryId: string | null;
  eventId: string | null;
  assignmentId: string | null;
  type: string;
  title: string;
  body: string;
  payload: Record<string, string | null>;
  readAt: Date | null;
  createdAt: Date;
}

export function mapVolunteerNotification(
  row: VolunteerNotificationRow,
): VolunteerNotification {
  const props: VolunteerNotificationProps = {
    churchId: row.churchId as ChurchId,
    volunteerId: row.volunteerId as VolunteerId,
    ministryId: (row.ministryId ?? undefined) as MinistryId | undefined,
    eventId: (row.eventId ?? undefined) as EventId | undefined,
    assignmentId: (row.assignmentId ?? undefined) as AssignmentId | undefined,
    type: assertEnum({
      field: 'type',
      value: row.type,
      valid: VOLUNTEER_NOTIFICATION_TYPE_OPTIONS,
    }) as VolunteerNotificationType,
    title: row.title,
    body: row.body,
    payload: row.payload as VolunteerNotificationPayload,
    readAt: row.readAt ?? undefined,
    createdAt: row.createdAt,
  };

  return new VolunteerNotification(props, row.id as VolunteerNotificationId);
}
