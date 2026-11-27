import type { NotificationPayload } from '../../notification-kinds';
import type { ChurchRecipient } from './church-notifications';
import type { NotificationSink } from './notifier';
import type { NotificationRepository } from '@/domain/contracts/infrastructure/notification.repository';

export interface InboxNotificationSinkDependencies {
  notificationRepository: NotificationRepository;
}

export interface IInboxNotificationSink
  extends NotificationSink<
    ChurchRecipient,
    ChurchRecipient,
    NotificationPayload
  > {}
