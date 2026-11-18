import type { NotificationId } from '../../branded-ids';
import type {
  NotificationOwner,
  NotificationPage,
} from '../../entities/notification';

export interface ListMemberNotificationsInput extends NotificationOwner {
  cursor?: string;
  limit?: number;
}

export interface MemberNotificationPage extends NotificationPage {
  /** Unread rows in the whole inbox, not only the loaded pages. */
  unreadCount: number;
}

export interface MarkMemberNotificationReadInput extends NotificationOwner {
  notificationId: NotificationId;
}

/** A member's own inbox. The owner always comes from the session, never the request. */
export interface INotificationManager {
  list(input: ListMemberNotificationsInput): Promise<MemberNotificationPage>;
  /** Throws NotFoundError for a missing, foreign-User or foreign-Church Notification alike. */
  markRead(input: MarkMemberNotificationReadInput): Promise<void>;
  markAllRead(input: NotificationOwner): Promise<void>;
}
