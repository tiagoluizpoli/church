import type { ChurchRecipient } from './church-notifications';
import type { NotificationSink } from './notifier';
import type {
  EmailLocale,
  EmailPayload,
  EmailSender,
} from '@/domain/contracts/infrastructure/email-sender';
import type { OutboxRepository } from '@/domain/contracts/infrastructure/outbox.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

/** A Church Member's email address, in the language they read. */
export interface EmailRecipientAddress {
  email: string;
  /** First word of the member's name; empty when they have none. */
  firstName: string;
  locale: EmailLocale;
}

export interface EmailNotificationSinkDependencies {
  emailSender: EmailSender;
  outboxRepository: OutboxRepository;
  unitOfWork: UnitOfWork;
  emailIdempotencyRetentionMs: number;
}

export interface PrepareInput {
  deliveryId: string;
  payload: EmailPayload;
  address: EmailRecipientAddress;
}

export interface IEmailNotificationSink
  extends NotificationSink<
    ChurchRecipient,
    EmailRecipientAddress,
    EmailPayload
  > {}
