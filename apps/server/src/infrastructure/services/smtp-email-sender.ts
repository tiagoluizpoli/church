import {
  createTransport,
  type SentMessageInfo,
  type Transporter,
} from 'nodemailer';
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
  /** Fail instead of sending in plaintext when STARTTLS is not offered. */
  requireTls?: boolean;
  user?: string;
  password?: string;
  from: string;
  appName: string;
}

const CONNECTION_TIMEOUT_MS = 5000;
const GREETING_TIMEOUT_MS = 5000;
const SOCKET_TIMEOUT_MS = 15000;
/** SMTP replies 500-599 are permanent; everything else is transient. */
const PERMANENT_REPLY_MIN = 500;
const PERMANENT_REPLY_MAX = 599;

function isPermanentReply(code: number | undefined): boolean {
  return (
    code !== undefined &&
    code >= PERMANENT_REPLY_MIN &&
    code <= PERMANENT_REPLY_MAX
  );
}

/** The fields of nodemailer's SMTP result this sender relies on. */
interface SmtpDelivery {
  messageId: string;
  rejected?: Array<string | { address: string }>;
  rejectedErrors?: unknown[];
}

/** Reads `responseCode` off an unknown thrown value without trusting its type. */
function responseCodeOf(failure: unknown): number | undefined {
  if (typeof failure !== 'object' || failure === null) return undefined;
  const code: unknown = Reflect.get(failure, 'responseCode');
  return typeof code === 'number' ? code : undefined;
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
    requireTls,
    user,
    password,
    from,
    appName,
  }: SmtpEmailSenderOptions) {
    this.transport = createTransport({
      host,
      port,
      secure,
      requireTLS: requireTls,
      auth: user ? { user, pass: password } : undefined,
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: GREETING_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
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
    const email = this.prepare({ payload, locale });
    return this.deliver({ email });
  }

  async deliver({ email }: DeliverEmailInput): Promise<SendEmailResult> {
    let info: SentMessageInfo;
    try {
      info = await this.transport.sendMail(email.request);
    } catch (cause) {
      throw new EmailSendError({
        message:
          cause instanceof Error ? cause.message : 'SMTP delivery failed.',
        retryable: !isPermanentReply(responseCodeOf(cause)),
      });
    }
    const {
      messageId,
      rejected = [],
      rejectedErrors = [],
    }: SmtpDelivery = info;
    // Nodemailer resolves when at least one recipient was accepted, so a
    // partial rejection must be surfaced here or the outbox marks it sent.
    if (rejected.length > 0) {
      const rejectedCodes = rejectedErrors.map(responseCodeOf);
      const addresses = rejected
        .map((entry) => (typeof entry === 'string' ? entry : entry.address))
        .join(', ');
      throw new EmailSendError({
        message: `SMTP rejected recipients: ${addresses}`,
        // Without a per-recipient reason, assume permanent: a retry would
        // re-send to the recipients that were already accepted.
        retryable:
          rejectedCodes.length > 0 && !rejectedCodes.some(isPermanentReply),
      });
    }
    return { providerMessageId: messageId };
  }
}
