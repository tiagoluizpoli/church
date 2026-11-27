import { CaptureEmailSender } from '../../infrastructure/services/capture-email-sender';
import { DeliveryModeEmailSender } from '../../infrastructure/services/delivery-mode-email-sender';
import { ResendEmailSender } from '../../infrastructure/services/resend-email-sender';
import { SmtpEmailSender } from '../../infrastructure/services/smtp-email-sender';
import type {
  EmailSenderConfig,
  EmailSenders,
  SenderChoice,
} from './email-senders.types';

/**
 * Exactly one sender, chosen once: tests are capture, a production
 * environment (or a local NODE_ENV=production run) is Resend, a deployed
 * development or staging environment routes by the database delivery mode
 * over SMTP (its Mailpit) and Resend, and local development follows
 * `devSender` (default SMTP). Never falls back.
 */
export function createEmailSenders(config: EmailSenderConfig): EmailSenders {
  const { nodeEnv, environment, devSender, smtp, resend, appName, platform } =
    config;
  const choice: SenderChoice =
    nodeEnv === 'test'
      ? 'capture'
      : environment === 'production'
        ? 'resend'
        : environment !== 'local'
          ? 'delivery-mode'
          : nodeEnv === 'production'
            ? 'resend'
            : (devSender ?? 'smtp');

  if (choice === 'capture') {
    const capture = new CaptureEmailSender({ appName, platform });
    return { serverEmailSender: capture, captureEmailSender: capture };
  }
  if (choice !== 'resend' && Boolean(smtp.user) !== Boolean(smtp.password)) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must be set together.');
  }
  const resendSender = () =>
    new ResendEmailSender({
      apiKey: resend.apiKey ?? '',
      from: resend.from,
      appName,
      platform,
    });
  const smtpSender = () => new SmtpEmailSender({ ...smtp, appName, platform });
  const serverEmailSender =
    choice === 'resend'
      ? resendSender()
      : choice === 'smtp'
        ? smtpSender()
        : new DeliveryModeEmailSender({
            mailpit: smtpSender(),
            resend: resendSender(),
            runtimeConfiguration: config.runtimeConfiguration,
          });
  return { serverEmailSender, captureEmailSender: undefined };
}
