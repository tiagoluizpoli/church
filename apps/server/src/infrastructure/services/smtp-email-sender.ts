import { createTransport, type Transporter } from 'nodemailer';
import type {
  DeliverEmailInput,
  EmailSender,
  PreparedEmail,
  PrepareEmailInput,
  SendEmailInput,
  SendEmailResult,
} from '../../domain/contracts/infrastructure/email-sender';
import { EmailSendError } from '../../domain/errors/email-send-error';
import { prepareEmail } from './email-templates';

export interface SmtpEmailSenderOptions {
  host: string;
  port: number;
  /** Implicit TLS (port 465); otherwise STARTTLS is used when offered. */
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  appName: string;
}

interface SmtpFailure {
  responseCode?: number;
}

/**
 * Generic SMTP delivery. Connects lazily, so an unreachable server never
 * blocks startup; each send reports its own failure. SMTP has no provider-side
 * idempotency, so `idempotencyKey` is ignored and an uncertain send that is
 * retried can arrive twice.
 */
export class SmtpEmailSender implements EmailSender {
  private readonly transport: Transporter;
  private readonly from: string;
  private readonly appName: string;

  constructor({
    host,
    port,
    secure,
    user,
    password,
    from,
    appName,
  }: SmtpEmailSenderOptions) {
    this.transport = createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: password } : undefined,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 15000,
    });
    this.from = from;
    this.appName = appName;
  }

  prepare({ payload, locale }: PrepareEmailInput): PreparedEmail {
    return prepareEmail({
      payload,
      locale,
      from: this.from,
      appName: this.appName,
    });
  }

  async send({ payload, locale }: SendEmailInput): Promise<SendEmailResult> {
    return this.deliver({ email: this.prepare({ payload, locale }) });
  }

  async deliver({ email }: DeliverEmailInput): Promise<SendEmailResult> {
    try {
      const info = await this.transport.sendMail(email.request);
      return { providerMessageId: info.messageId };
    } catch (cause) {
      const { responseCode } = cause as SmtpFailure;
      throw new EmailSendError({
        message:
          cause instanceof Error ? cause.message : 'SMTP delivery failed.',
        // 5xx replies are permanent; connection errors and 4xx are transient.
        retryable: !(
          responseCode !== undefined &&
          responseCode >= 500 &&
          responseCode < 600
        ),
      });
    }
  }
}
