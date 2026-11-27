import type { ChurchRecipient } from '../domain/contracts/application/church-notifications';
import type {
  IInboxNotificationSink,
  InboxNotificationSinkDependencies,
} from '../domain/contracts/application/inbox-notification-sink';
import type {
  SinkDeliverInput,
  SinkOutcome,
} from '../domain/contracts/application/notifier';
import type { NotificationRepository } from '../domain/contracts/infrastructure/notification.repository';
import type { NotificationPayload } from '../domain/notification-kinds';

/**
 * Writes the member inbox row, keyed by the delivery: a replay keeps the
 * existing row, its frozen facts and its read state.
 */
export class InboxNotificationSink implements IInboxNotificationSink {
  private readonly notificationRepository: NotificationRepository;

  constructor({ notificationRepository }: InboxNotificationSinkDependencies) {
    this.notificationRepository = notificationRepository;
  }

  async deliver({
    address,
    deliveryId,
    render,
  }: SinkDeliverInput<
    ChurchRecipient,
    ChurchRecipient,
    NotificationPayload
  >): Promise<SinkOutcome> {
    await this.notificationRepository.create({
      userId: address.userId,
      churchId: address.churchId,
      payload: render(),
      sourceOutboxId: deliveryId,
    });
    return { status: 'delivered' };
  }
}
