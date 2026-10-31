import { nowAsDate } from '@church/time';
import type {
  EnqueueNotificationInput,
  IChurchNotifications,
} from '../domain/contracts/application/church-notifications';
import type { OutboxRepository } from '../domain/contracts/infrastructure/outbox.repository';
import {
  type NotificationKind,
  notificationRequestDataSchemas,
} from '../domain/notification-kinds';

interface ChurchNotificationsDependencies {
  outboxRepository: OutboxRepository;
}

export class ChurchNotifications implements IChurchNotifications {
  private readonly outboxRepository: OutboxRepository;

  constructor({ outboxRepository }: ChurchNotificationsDependencies) {
    this.outboxRepository = outboxRepository;
  }

  async enqueue<K extends NotificationKind>({
    tx,
    kind,
    to,
    data,
  }: EnqueueNotificationInput<K>): Promise<void> {
    const validData = notificationRequestDataSchemas[kind].parse(data);
    const recipients = new Map(
      to.map((recipient) => [
        `${recipient.churchId}/${recipient.userId}`,
        recipient,
      ]),
    );
    const correlationId = crypto.randomUUID();
    for (const { userId, churchId } of recipients.values()) {
      await this.outboxRepository.enqueueNotification({
        churchId,
        payload: { to: { userId, churchId }, kind, data: validData },
        correlationId,
        scheduledFor: nowAsDate(),
        tx,
      });
    }
  }
}
