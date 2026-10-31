import type { NotificationId } from '../../branded-ids';
import type {
  Notification,
  NotificationOwner,
  NotificationPage,
} from '../../entities/notification';
import type { NotificationPayload } from '../../notification-kinds';
import type { TransactionContext } from './transaction-context';

export interface CreateNotificationInput extends NotificationOwner {
  payload: NotificationPayload;
  sourceOutboxId: string;
  createdAt?: Date;
  tx?: TransactionContext;
}

export interface ListNotificationsInput extends NotificationOwner {
  /** Opaque cursor from a previous page's `nextCursor`. */
  cursor?: string;
  limit: number;
  tx?: TransactionContext;
}

export interface CountUnreadNotificationsInput extends NotificationOwner {
  tx?: TransactionContext;
}

export interface MarkNotificationReadInput extends NotificationOwner {
  notificationId: NotificationId;
  tx?: TransactionContext;
}

export interface MarkAllNotificationsReadInput extends NotificationOwner {
  tx?: TransactionContext;
}

export interface NotificationRepository {
  /** Idempotent on `sourceOutboxId`: a replay returns the existing row untouched. */
  create(input: CreateNotificationInput): Promise<Notification>;
  list(input: ListNotificationsInput): Promise<NotificationPage>;
  /** Counts the whole inbox, not only loaded pages. */
  countUnread(input: CountUnreadNotificationsInput): Promise<number>;
  /** False when the owner has no such Notification; the first read Instant is kept on repeats. */
  markRead(input: MarkNotificationReadInput): Promise<boolean>;
  markAllRead(input: MarkAllNotificationsReadInput): Promise<number>;
}
