import type { AppConfig } from '@church/app-config';
import type {
  NotificationDeliveryData,
  NotificationDeliveryDataByKind,
  NotificationRequestKind,
  TransferDigestDeliveryFacts,
} from '../../notification-kinds';
import type { ChurchRecipient } from './church-notifications';
import type {
  EmailRecipientAddress,
  IEmailNotificationSink,
} from './email-notification-sink';
import type { IInboxNotificationSink } from './inbox-notification-sink';
import type { INotifier, NotificationTemplate } from './notifier';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { EmailSender } from '@/domain/contracts/infrastructure/email-sender';
import type { NotificationRepository } from '@/domain/contracts/infrastructure/notification.repository';
import type { OutboxRepository } from '@/domain/contracts/infrastructure/outbox.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

/** The Notifier with the Church's recipient, kinds and delivery facts fixed. */
export type ChurchNotifier = INotifier<
  ChurchRecipient,
  NotificationRequestKind,
  NotificationDeliveryData
>;

/** Each kind's template sees that kind's own delivery facts. */
export type TemplatesByKind<TAddress, TContent> = {
  [K in NotificationRequestKind]?: NotificationTemplate<
    NotificationDeliveryDataByKind[K],
    TAddress,
    TContent
  >;
};

export interface TransferDigestEmailInput {
  kind: 'transfer.ministry-digest' | 'transfer.leaderless-ministry';
  data: TransferDigestDeliveryFacts;
  address: EmailRecipientAddress;
}

export interface BuildChurchNotifierInput {
  config: AppConfig;
  churchRepository: ChurchRepository;
  notificationRepository: NotificationRepository;
  outboxRepository: OutboxRepository;
  emailSender: EmailSender;
  unitOfWork: UnitOfWork;
}

export interface RegisterChurchSinksInput {
  config: AppConfig;
  churchRepository: ChurchRepository;
  emailSink: IEmailNotificationSink;
  inboxSink: IInboxNotificationSink;
}
