export interface NotificationService {
  publish(event: {
    type: 'event_published' | 'event_cancelled';
    churchId: string;
    eventId: string;
    actorId: string;
    assignmentIds: string[];
  }): Promise<void>;
}
