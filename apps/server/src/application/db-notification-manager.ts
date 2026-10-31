import { NotFoundError } from '@church/core';
import type {
  INotificationManager,
  ListMemberNotificationsInput,
  MarkMemberNotificationReadInput,
  MemberNotificationPage,
} from '../domain/contracts/application/notification-manager';
import type { NotificationRepository } from '../domain/contracts/infrastructure/notification.repository';
import type { NotificationOwner } from '../domain/entities/notification';

interface DbNotificationManagerDependencies {
  notificationRepository: NotificationRepository;
  /** Page size when the caller names none (validated central config). */
  defaultPageSize: number;
}

export class DbNotificationManager implements INotificationManager {
  private readonly notificationRepository: NotificationRepository;
  private readonly defaultPageSize: number;

  constructor({
    notificationRepository,
    defaultPageSize,
  }: DbNotificationManagerDependencies) {
    this.notificationRepository = notificationRepository;
    this.defaultPageSize = defaultPageSize;
  }

  async list({
    userId,
    churchId,
    cursor,
    limit,
  }: ListMemberNotificationsInput): Promise<MemberNotificationPage> {
    const [page, unreadCount] = await Promise.all([
      this.notificationRepository.list({
        userId,
        churchId,
        cursor,
        limit: limit ?? this.defaultPageSize,
      }),
      this.notificationRepository.countUnread({ userId, churchId }),
    ]);
    return { ...page, unreadCount };
  }

  async markRead(input: MarkMemberNotificationReadInput): Promise<void> {
    if (!(await this.notificationRepository.markRead(input))) {
      throw new NotFoundError('Notification not found');
    }
  }

  async markAllRead(input: NotificationOwner): Promise<void> {
    await this.notificationRepository.markAllRead(input);
  }
}
