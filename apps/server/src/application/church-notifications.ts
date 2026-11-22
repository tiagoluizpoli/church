import { nowAsDate } from '@church/time';
import type {
  ChurchIdentitySnapshot,
  ChurchIdentitySnapshotter,
} from '../domain/contracts/application/church-identity-snapshotter';
import type {
  EnqueueNotificationInput,
  IChurchNotifications,
} from '../domain/contracts/application/church-notifications';
import type { OutboxRepository } from '../domain/contracts/infrastructure/outbox.repository';
import {
  type NotificationRequest,
  type NotificationRequestKind,
  notificationRequestDataSchemas,
} from '../domain/notification-kinds';

interface ChurchNotificationsDependencies {
  outboxRepository: OutboxRepository;
  churchIdentity: ChurchIdentitySnapshotter;
}

export class ChurchNotifications implements IChurchNotifications {
  private readonly outboxRepository: OutboxRepository;
  private readonly churchIdentity: ChurchIdentitySnapshotter;

  constructor({
    outboxRepository,
    churchIdentity,
  }: ChurchNotificationsDependencies) {
    this.outboxRepository = outboxRepository;
    this.churchIdentity = churchIdentity;
  }

  async enqueue<K extends NotificationRequestKind>({
    tx,
    kind,
    to,
    data,
  }: EnqueueNotificationInput<K>): Promise<void> {
    const recipients = new Map(
      to.map((recipient) => [
        `${recipient.churchId}/${recipient.userId}`,
        recipient,
      ]),
    );
    const correlationId = crypto.randomUUID();
    const identities = new Map<string, ChurchIdentitySnapshot>();
    for (const { userId, churchId } of recipients.values()) {
      // Frozen per Church at queue time, inside the change's transaction.
      const identity =
        identities.get(churchId) ??
        (await this.churchIdentity.snapshot({ churchId, tx }));
      identities.set(churchId, identity);
      // Parsed by the kind's own schema, so kind and data agree.
      const request = {
        kind,
        data: notificationRequestDataSchemas[kind].parse({
          ...data,
          ...identity,
        }),
      } as NotificationRequest;
      await this.outboxRepository.enqueueNotification({
        churchId,
        payload: { to: { userId, churchId }, ...request },
        correlationId,
        scheduledFor: nowAsDate(),
        tx,
      });
    }
  }
}
