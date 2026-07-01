import { EventEmitter } from 'node:events';
import type { ChurchId } from '../../domain/entities/church';
import type { VolunteerId } from '../../domain/entities/volunteer';
import type {
  DeclineNotification,
  NotificationService,
  PublishNotification,
  ReminderNotification,
  VolunteerScheduleNotification,
} from '../../domain/services/notification-service';
import { repositories } from '../repositories/registry';

export class LocalNotificationService implements NotificationService {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Stub implementation: log notifications to console for event-driven diagnostics.
    this.emitter.on('event_published', (payload) => {
      console.log('[NotificationService] Event published:', payload);
    });
    this.emitter.on('event_cancelled', (payload) => {
      console.log('[NotificationService] Event cancelled:', payload);
    });
  }

  async publish(event: PublishNotification): Promise<void> {
    this.emitter.emit(event.type, event);
  }

  async notifyReminder(event: ReminderNotification): Promise<void> {
    console.log('[NotificationService] Reminder:', event);
    this.emitter.emit('reminder', event);
  }

  async notifyVolunteer(event: VolunteerScheduleNotification): Promise<void> {
    console.log('[NotificationService] Volunteer inbox notification:', event);
    await repositories.volunteerNotifications.create(
      event.churchId as ChurchId,
      {
        volunteerId: event.volunteerId as VolunteerId,
        ministryId: event.ministryId,
        eventId: event.eventId,
        assignmentId: event.assignmentId,
        type: event.type,
        title: event.title,
        body: event.body,
        payload: event.payload,
      },
    );
    this.emitter.emit('volunteer_notification', event);
  }

  async notifyLeaderOfDecline(event: DeclineNotification): Promise<void> {
    console.log('[NotificationService] Volunteer declined:', event);
    this.emitter.emit('volunteer_declined', event);
  }
}

export const notificationService = new LocalNotificationService();
