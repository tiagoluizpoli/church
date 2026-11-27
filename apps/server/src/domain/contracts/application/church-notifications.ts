import type { ChurchId, UserId } from '../../branded-ids';
import type {
  NotificationEnqueueDataOf,
  NotificationRequestKind,
} from '../../notification-kinds';
import type { ChurchIdentitySnapshotter } from '@/domain/contracts/application/church-identity-snapshotter';
import type { OutboxRepository } from '@/domain/contracts/infrastructure/outbox.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';

/** A Notification's addressee: a User within one Church. Later fields stay optional. */
export interface ChurchRecipient {
  userId: UserId;
  churchId: ChurchId;
}

export interface EnqueueNotificationInput<K extends NotificationRequestKind> {
  /** The change's own transaction: the rows commit or roll back with it. */
  tx: TransactionContext;
  kind: K;
  to: ChurchRecipient[];
  /** The Church identity is stamped by `enqueue`, not supplied. */
  data: NotificationEnqueueDataOf<K>;
}

export interface IChurchNotifications {
  /**
   * Validates `data` for `kind` and writes one outbox row per recipient,
   * deduplicated by User within Church. Never sends; empty `to` writes nothing.
   */
  enqueue<K extends NotificationRequestKind>(
    input: EnqueueNotificationInput<K>,
  ): Promise<void>;
}

export interface ChurchNotificationsDependencies {
  outboxRepository: OutboxRepository;
  churchIdentity: ChurchIdentitySnapshotter;
}
