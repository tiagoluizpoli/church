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

export interface NotificationService {
  publish(event: PublishNotification): Promise<void>;

  /** Notify a volunteer to submit availability for an event (reminder). */
  notifyReminder(event: ReminderNotification): Promise<void>;

  /** Notify a leader that a volunteer declined a published assignment. */
  notifyLeaderOfDecline(event: DeclineNotification): Promise<void>;
}
