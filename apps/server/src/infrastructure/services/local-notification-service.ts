import { EventEmitter } from 'node:events';
import type { NotificationService } from '../../domain/services/notification-service';

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

  async publish(event: {
    type: 'event_published' | 'event_cancelled';
    churchId: string;
    eventId: string;
    actorId: string;
    assignmentIds: string[];
  }): Promise<void> {
    this.emitter.emit(event.type, event);
  }
}

export const notificationService = new LocalNotificationService();
