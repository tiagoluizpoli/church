import type { AssignmentId } from '../../entities/assignment';
import type { EventId } from '../../entities/event';
import type { MinistryId } from '../../entities/ministry';
import type {
  VolunteerNotificationPayload,
  VolunteerNotificationType,
} from '../../entities/volunteer-notification';

export interface PublishNotification {
  type: 'event_published' | 'event_cancelled';
  churchId: string;
  eventId: string;
  actorId: string;
  assignmentIds: string[];
}

export interface ReminderNotification {
  churchId: string;
  eventId: string;
  volunteerId: string;
}

export interface DeclineNotification {
  churchId: string;
  eventId: string;
  leaderUserId: string;
  volunteerId: string;
  volunteerName: string;
  slotLabel: string;
  roleName: string;
}

export interface VolunteerScheduleNotification {
  churchId: string;
  volunteerId: string;
  ministryId?: MinistryId;
  eventId?: EventId;
  assignmentId?: AssignmentId;
  type: VolunteerNotificationType;
  title: string;
  body: string;
  payload: VolunteerNotificationPayload;
}

export interface NotificationService {
  publish(event: PublishNotification): Promise<void>;

  /** Notify a volunteer to submit availability for an event (reminder). */
  notifyReminder(event: ReminderNotification): Promise<void>;

  /** Persist a volunteer-facing scheduling notification for the inbox. */
  notifyVolunteer(event: VolunteerScheduleNotification): Promise<void>;

  /** Notify a leader that a volunteer declined a published assignment. */
  notifyLeaderOfDecline(event: DeclineNotification): Promise<void>;
}
