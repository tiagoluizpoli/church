import type {
  AssignmentId,
  CycleId,
  EventId,
  MinistryId,
} from '../../branded-ids';
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

export interface DeclineNotification {
  churchId: string;
  eventId: string;
  leaderUserId: string;
  volunteerId: string;
  volunteerName: string;
  eventTimeBlockLabel: string;
  roleName: string;
}

export interface VolunteerScheduleNotification {
  churchId: string;
  volunteerId: string;
  cycleId?: CycleId;
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

  /** Persist a volunteer-facing scheduling notification for the inbox. */
  notifyVolunteer(event: VolunteerScheduleNotification): Promise<void>;

  /** Notify a leader that a volunteer declined a published assignment. */
  notifyLeaderOfDecline(event: DeclineNotification): Promise<void>;
}
