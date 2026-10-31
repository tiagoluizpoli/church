import type { ChurchId, UserId } from '../../branded-ids';
import type {
  NotificationKind,
  NotificationRequestDataOf,
} from '../../notification-kinds';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';

/** A Notification's addressee: a User within one Church. Later fields stay optional. */
export interface ChurchRecipient {
  userId: UserId;
  churchId: ChurchId;
}

export interface EnqueueNotificationInput<K extends NotificationKind> {
  /** The change's own transaction: the rows commit or roll back with it. */
  tx: TransactionContext;
  kind: K;
  to: ChurchRecipient[];
  data: NotificationRequestDataOf<K>;
}

export interface IChurchNotifications {
  /**
   * Validates `data` for `kind` and writes one outbox row per recipient,
   * deduplicated by User within Church. Never sends; empty `to` writes nothing.
   */
  enqueue<K extends NotificationKind>(
    input: EnqueueNotificationInput<K>,
  ): Promise<void>;
}
