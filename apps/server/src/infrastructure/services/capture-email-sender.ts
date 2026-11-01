import type {
  DeliverEmailInput,
  EmailPayload,
  EmailSender,
  PreparedEmail,
  PrepareEmailInput,
  ReplayableEmail,
  SendEmailInput,
  SendEmailResult,
} from '../../domain/contracts/infrastructure/email-sender';
import type {
  LastVerificationCodeForInput,
  VerificationCodeInspector,
} from '../../domain/contracts/infrastructure/verification-code-inspector';
import { prepareEmail } from './email-templates';

const CAPTURE_FROM = 'Church <capture@church.test>';

/**
 * Bound in every environment except production so no suite or local run ever
 * dispatches real mail. Records what would have been sent for assertions.
 * Like the provider, a repeated idempotency key is deduplicated: it records
 * nothing new, so a replay is observable as one captured email.
 */
export class CaptureEmailSender
  implements EmailSender, VerificationCodeInspector
{
  readonly sent: EmailPayload[] = [];
  readonly delivered: ReplayableEmail[] = [];
  private readonly seenKeys = new Set<string>();

  constructor(private readonly appName: string) {}

  prepare({ payload, locale }: PrepareEmailInput): PreparedEmail {
    return prepareEmail({
      payload,
      locale,
      from: CAPTURE_FROM,
      appName: this.appName,
    });
  }

  async send({ payload, locale }: SendEmailInput): Promise<SendEmailResult> {
    const email = this.prepare({ payload, locale });
    return this.deliver({ email });
  }

  async deliver({
    email,
    idempotencyKey,
  }: DeliverEmailInput): Promise<SendEmailResult> {
    if (idempotencyKey !== undefined) {
      if (this.seenKeys.has(idempotencyKey)) return {};
      this.seenKeys.add(idempotencyKey);
    }
    this.sent.push(email.payload);
    this.delivered.push(email);
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
