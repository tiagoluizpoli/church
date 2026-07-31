import type {
  EmailPayload,
  EmailSender,
  SendEmailResult,
} from '../../domain/contracts/infrastructure/email-sender';

/**
 * Bound in every environment except production so no suite or local run ever
 * dispatches real mail. Records what would have been sent for assertions.
 */
export class CaptureEmailSender implements EmailSender {
  readonly sent: EmailPayload[] = [];

  async send(payload: EmailPayload): Promise<SendEmailResult> {
    this.sent.push(payload);
    return {};
  }
}
