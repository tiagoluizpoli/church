import type {
  EmailPayload,
  EmailSender,
} from '../../domain/contracts/infrastructure/email-sender';

/**
 * Bound in every environment except production so no suite or local run ever
 * dispatches real mail. Records what would have been sent for assertions.
 */
export class CaptureEmailSender implements EmailSender {
  readonly sent: EmailPayload[] = [];

  async send(payload: EmailPayload): Promise<void> {
    this.sent.push(payload);
  }
}
