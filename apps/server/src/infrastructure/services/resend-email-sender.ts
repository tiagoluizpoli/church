import { Resend } from 'resend';
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

export interface ResendEmailSenderOptions {
  apiKey: string;
  from: string;
}

interface SendViaResendInput {
  request: Parameters<Resend['emails']['send']>[0];
  idempotencyKey?: string;
}

/**
 * Status codes Resend documents as non-retryable (bad request, auth, invalid
 * recipient) vs retryable (rate limit, server error). See
 * https://resend.com/docs/api-reference/errors and the Node SDK's
 * `{ data, error }` response shape — Resend never throws on an API-level
 * send failure. A rejected promise (network/connection error, timeout)
 * is always retryable, per spec §6.4.
 */
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 422]);

/**
 * Both idempotency conflicts answer 409, so they are told apart by name
 * (https://resend.com/docs/dashboard/emails/idempotency-keys): a changed
 * payload under a used key can never succeed, while a concurrent request on
 * the same key may once the original finishes.
 */
const NON_RETRYABLE_ERROR_NAMES = new Set(['invalid_idempotent_request']);
const RETRYABLE_ERROR_NAMES = new Set(['concurrent_idempotent_requests']);

export class ResendEmailSender implements EmailSender {
  private readonly client: Resend;
  private readonly from: string;

  constructor({ apiKey, from }: ResendEmailSenderOptions) {
    if (!apiKey) {
      throw new Error(
        'ResendEmailSender requires a non-empty apiKey (RESEND_API_KEY).',
      );
    }
    this.client = new Resend(apiKey);
    this.from = from;
  }

  prepare({ payload, locale }: PrepareEmailInput): PreparedEmail {
    return prepareEmail({ payload, locale, from: this.from });
  }

  async send({ payload }: SendEmailInput): Promise<SendEmailResult> {
    return this.deliver({ email: this.prepare({ payload }) });
  }

  async deliver({
    email,
    idempotencyKey,
  }: DeliverEmailInput): Promise<SendEmailResult> {
    const { data, error } = await this.sendViaResend({
      request: email.request,
      idempotencyKey,
    });

    if (error) {
      throw new EmailSendError({
        message: error.message,
        retryable: isRetryable({
          name: error.name,
          statusCode: error.statusCode ?? 500,
        }),
      });
    }

    return { providerMessageId: data?.id };
  }

  private async sendViaResend({
    request,
    idempotencyKey,
  }: SendViaResendInput): ReturnType<Resend['emails']['send']> {
    try {
      return idempotencyKey
        ? await this.client.emails.send(request, { idempotencyKey })
        : await this.client.emails.send(request);
    } catch (cause) {
      throw new EmailSendError({
        message:
          cause instanceof Error
            ? cause.message
            : 'Resend request failed before a response was received.',
        retryable: true,
      });
    }
  }
}

interface IsRetryableInput {
  name: string;
  statusCode: number;
}

function isRetryable({ name, statusCode }: IsRetryableInput): boolean {
  if (NON_RETRYABLE_ERROR_NAMES.has(name)) return false;
  if (RETRYABLE_ERROR_NAMES.has(name)) return true;
  return !NON_RETRYABLE_STATUS_CODES.has(statusCode);
}
