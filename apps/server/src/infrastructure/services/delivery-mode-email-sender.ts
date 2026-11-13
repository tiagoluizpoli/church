import type {
  DeliverEmailInput,
  EmailDestination,
  EmailSender,
  PreparedEmail,
  PrepareEmailInput,
  SendEmailInput,
  SendEmailResult,
} from '../../domain/contracts/infrastructure/email-sender';
import type { RuntimeConfigurationRepository } from '../../domain/contracts/infrastructure/runtime-configuration.repository';
import { EmailSendError } from '../../domain/errors/email-send-error';

const DESTINATIONS_BY_MODE: Record<string, EmailDestination[]> = {
  mailpit: ['mailpit'],
  resend: ['resend'],
  both: ['mailpit', 'resend'],
};
const SAFE_DESTINATIONS: EmailDestination[] = ['mailpit'];

export interface DeliveryModeEmailSenderInput {
  mailpit: EmailSender;
  resend: EmailSender;
  runtimeConfiguration: RuntimeConfigurationRepository;
}

interface DestinationsForInput {
  frozenMode: unknown;
}

interface DestinationFailure {
  destination: EmailDestination;
  error: EmailSendError;
}

/**
 * Development/staging delivery: routes each email to Mailpit, Resend or both
 * by the operator's `email_delivery_mode` as it was when the email was
 * created. A missing or invalid mode routes to Mailpit only, so an unset or
 * mistyped value never reaches real recipients. Each destination confirms on
 * its own; a retry sends only to those that have not.
 */
export class DeliveryModeEmailSender implements EmailSender {
  private readonly senders: Record<EmailDestination, EmailSender>;
  private readonly runtimeConfiguration: RuntimeConfigurationRepository;

  constructor({
    mailpit,
    resend,
    runtimeConfiguration,
  }: DeliveryModeEmailSenderInput) {
    this.senders = { mailpit, resend };
    this.runtimeConfiguration = runtimeConfiguration;
  }

  /** Resend's verified sender address; Mailpit accepts any. */
  prepare(input: PrepareEmailInput): PreparedEmail {
    return this.senders.resend.prepare(input);
  }

  /** A direct email reads the mode now; a database failure rejects. */
  async send({ payload, locale }: SendEmailInput): Promise<SendEmailResult> {
    const frozenMode = await this.runtimeConfiguration.findEmailDeliveryMode();
    const email = this.prepare({ payload, locale });
    return this.deliver({
      email,
      routing: { frozenMode, confirmed: [], confirm: async () => {} },
    });
  }

  async deliver({
    email,
    idempotencyKey,
    routing,
  }: DeliverEmailInput): Promise<SendEmailResult> {
    const destinations = destinationsFor({ frozenMode: routing?.frozenMode });
    const confirmed = routing?.confirmed ?? [];
    const failures: DestinationFailure[] = [];
    let providerMessageId: string | undefined;
    for (const destination of destinations) {
      if (confirmed.includes(destination)) continue;
      try {
        const result = await this.senders[destination].deliver({
          email,
          idempotencyKey,
        });
        providerMessageId = result.providerMessageId ?? providerMessageId;
      } catch (error) {
        if (!(error instanceof EmailSendError)) throw error;
        failures.push({ destination, error });
        continue;
      }
      await routing?.confirm({ destination });
    }
    if (failures.length > 0) {
      throw new EmailSendError({
        message: failures
          .map(({ destination, error }) => `${destination}: ${error.message}`)
          .join('; '),
        retryable: failures.every(({ error }) => error.retryable),
      });
    }
    return { providerMessageId };
  }
}

function destinationsFor({
  frozenMode,
}: DestinationsForInput): EmailDestination[] {
  if (
    typeof frozenMode === 'string' &&
    Object.hasOwn(DESTINATIONS_BY_MODE, frozenMode)
  ) {
    return DESTINATIONS_BY_MODE[frozenMode] ?? SAFE_DESTINATIONS;
  }
  // Never echo the value: it is free-form operator input.
  console.warn(
    '[Email] email_delivery_mode is missing or not one of "mailpit", "resend", "both"; delivering to Mailpit only',
  );
  return SAFE_DESTINATIONS;
}
