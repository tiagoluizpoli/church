import { Resend } from 'resend';
import type {
  EmailPayload,
  EmailSender,
} from '../../domain/contracts/infrastructure/email-sender';
import { EmailSendError } from '../../domain/errors/email-send-error';

export interface ResendEmailSenderOptions {
  apiKey: string;
  from: string;
}

interface ComposedEmail {
  subject: string;
  html: string;
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

  async send(payload: EmailPayload): Promise<void> {
    const { subject, html } = composeEmail(payload);

    const { error } = await this.sendViaResend({
      from: this.from,
      to: payload.to,
      subject,
      html,
    });

    if (error) {
      throw new EmailSendError({
        message: error.message,
        retryable: !NON_RETRYABLE_STATUS_CODES.has(error.statusCode ?? 500),
      });
    }
  }

  private async sendViaResend(
    request: Parameters<Resend['emails']['send']>[0],
  ): ReturnType<Resend['emails']['send']> {
    try {
      return await this.client.emails.send(request);
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

function composeEmail(payload: EmailPayload): ComposedEmail {
  switch (payload.kind) {
    case 'invitation.chained':
    case 'invitation.ministry':
      return {
        subject: `You're invited to serve at ${payload.churchName}`,
        html: `
          <p>You've been invited to join <strong>${payload.ministryName}</strong> at ${payload.churchName} as a ${payload.ministryAccessLevel}.</p>
          ${payload.roleNames.length > 0 ? `<p>Roles: ${payload.roleNames.join(', ')}</p>` : ''}
          <p>This invitation expires on ${payload.expiresAt.toDateString()}.</p>
          <p><a href="${payload.redemptionUrl}">Accept invitation</a></p>
        `,
      };
    case 'invitation.church-bootstrap':
      return {
        subject: `You're invited to administer ${payload.churchName}`,
        html: `
          <p>You've been invited to become an administrator of ${payload.churchName}.</p>
          <p><a href="${payload.redemptionUrl}">Accept invitation</a></p>
        `,
      };
  }
}
