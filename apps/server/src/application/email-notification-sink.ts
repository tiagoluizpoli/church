import { millisecondsBetween, now } from '@church/time';
import type { ChurchRecipient } from '../domain/contracts/application/church-notifications';
import type {
  NotificationSink,
  SinkDeliverInput,
  SinkOutcome,
} from '../domain/contracts/application/notifier';
import type {
  EmailLocale,
  EmailPayload,
  EmailSender,
} from '../domain/contracts/infrastructure/email-sender';
import type {
  OutboxEmailDelivery,
  OutboxRepository,
} from '../domain/contracts/infrastructure/outbox.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import { EmailSendError } from '../domain/errors/email-send-error';

/** A Church Member's email address, in the language they read. */
export interface EmailRecipientAddress {
  email: string;
  locale: EmailLocale;
}

interface EmailNotificationSinkDependencies {
  emailSender: EmailSender;
  outboxRepository: OutboxRepository;
  unitOfWork: UnitOfWork;
  emailIdempotencyRetentionMs: number;
}

/**
 * Delivers through the prepared-request boundary (ticket 09.1): the request,
 * the delivery-derived key and the first-attempt Instant are persisted before
 * the first provider call and resent unchanged; a confirmed receipt
 * suppresses any replay.
 */
export class EmailNotificationSink
  implements
    NotificationSink<ChurchRecipient, EmailRecipientAddress, EmailPayload>
{
  private readonly emailSender: EmailSender;
  private readonly outboxRepository: OutboxRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly emailIdempotencyRetentionMs: number;

  constructor({
    emailSender,
    outboxRepository,
    unitOfWork,
    emailIdempotencyRetentionMs,
  }: EmailNotificationSinkDependencies) {
    this.emailSender = emailSender;
    this.outboxRepository = outboxRepository;
    this.unitOfWork = unitOfWork;
    this.emailIdempotencyRetentionMs = emailIdempotencyRetentionMs;
  }

  async deliver({
    address,
    deliveryId,
    render,
  }: SinkDeliverInput<
    ChurchRecipient,
    EmailRecipientAddress,
    EmailPayload
  >): Promise<SinkOutcome> {
    const saved = await this.outboxRepository.findEmailDelivery({
      id: deliveryId,
    });
    if (saved?.deliveredAt) return { status: 'delivered' };
    if (
      saved &&
      millisecondsBetween({ start: saved.firstAttemptAt, end: now() }) >=
        this.emailIdempotencyRetentionMs
    ) {
      // The provider may have forgotten the key, and a new key would not
      // deduplicate either: an unconfirmed attempt this old is never resent.
      return {
        status: 'terminal',
        reason: 'Email idempotency retention elapsed since the first attempt',
      };
    }
    const delivery =
      saved ?? (await this.prepare({ deliveryId, payload: render(), address }));
    try {
      const result = await this.emailSender.deliver({
        email: delivery.email,
        idempotencyKey: delivery.idempotencyKey,
      });
      await this.unitOfWork.run((tx) =>
        this.outboxRepository.recordEmailDelivered({
          id: deliveryId,
          providerMessageId: result.providerMessageId,
          deliveredAt: now(),
          tx,
        }),
      );
      return { status: 'delivered' };
    } catch (error) {
      if (!(error instanceof EmailSendError)) throw error;
      return {
        status: error.retryable ? 'retryable' : 'terminal',
        reason: error.message,
      };
    }
  }

  private async prepare({
    deliveryId,
    payload,
    address,
  }: PrepareInput): Promise<OutboxEmailDelivery> {
    const delivery: OutboxEmailDelivery = {
      email: this.emailSender.prepare({ payload, locale: address.locale }),
      idempotencyKey: `outbox-message/${deliveryId}`,
      firstAttemptAt: now(),
    };
    await this.unitOfWork.run((tx) =>
      this.outboxRepository.recordEmailPrepared({
        id: deliveryId,
        ...delivery,
        tx,
      }),
    );
    return delivery;
  }
}

interface PrepareInput {
  deliveryId: string;
  payload: EmailPayload;
  address: EmailRecipientAddress;
}
