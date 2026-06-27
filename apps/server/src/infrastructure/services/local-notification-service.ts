import { EventEmitter } from 'node:events';
import type {
  DeclineNotification,
  NotificationService,
  PublishNotification,
  ReminderNotification,
} from '../../domain/services/notification-service';

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

  async notifyLeaderOfDecline(event: DeclineNotification): Promise<void> {
    console.log('[NotificationService] Volunteer declined:', event);
    this.emitter.emit('volunteer_declined', event);
  }
}

export const notificationService = new LocalNotificationService();
