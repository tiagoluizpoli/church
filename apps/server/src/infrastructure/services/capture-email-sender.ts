import type {
  EmailPayload,
  EmailSender,
  SendEmailInput,
  SendEmailResult,
} from '../../domain/contracts/infrastructure/email-sender';
import type {
  LastVerificationCodeForInput,
  VerificationCodeInspector,
} from '../../domain/contracts/infrastructure/verification-code-inspector';

/**
 * Bound in every environment except production so no suite or local run ever
 * dispatches real mail. Records what would have been sent for assertions.
 */
export class CaptureEmailSender
  implements EmailSender, VerificationCodeInspector
{
  readonly sent: EmailPayload[] = [];

  async send({ payload }: SendEmailInput): Promise<SendEmailResult> {
    this.sent.push(payload);
    return {};
  }

  /** Most recent verification code sent to `to`, if any — the one non-prod
   * hook an E2E run has for a code otherwise only ever hashed at rest. */
  lastVerificationCodeFor({
    to,
  }: LastVerificationCodeForInput): string | undefined {
    const matches = this.sent.filter(
      (payload) =>
        payload.kind === 'invitation.verification-code' && payload.to === to,
    );
    const lastMatch = matches.at(-1);
    return lastMatch?.kind === 'invitation.verification-code'
      ? lastMatch.code
      : undefined;
  }
}
