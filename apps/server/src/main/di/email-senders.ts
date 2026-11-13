import type { EmailSender } from '../../domain/contracts/infrastructure/email-sender';
import type { RuntimeConfigurationRepository } from '../../domain/contracts/infrastructure/runtime-configuration.repository';
import { CaptureEmailSender } from '../../infrastructure/services/capture-email-sender';
import { DeliveryModeEmailSender } from '../../infrastructure/services/delivery-mode-email-sender';
import { ResendEmailSender } from '../../infrastructure/services/resend-email-sender';
import { SmtpEmailSender } from '../../infrastructure/services/smtp-email-sender';

export type DevEmailSender = 'smtp' | 'resend' | 'capture';

export type ChurchEnvironment =
  | 'local'
  | 'development'
  | 'staging'
  | 'production';

export interface EmailSenderConfig {
  nodeEnv: 'development' | 'production' | 'test';
  environment: ChurchEnvironment;
  /** Read per email in development and staging only. */
  runtimeConfiguration: RuntimeConfigurationRepository;
  /** Development selection; unset means SMTP. Ignored in test and production. */
  devSender: DevEmailSender | undefined;
  appName: string;
  resend: { apiKey: string | undefined; from: string };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    requireTls?: boolean;
    user?: string;
    password?: string;
    from: string;
  };
}

export interface EmailSenders {
  serverEmailSender: EmailSender;
  /** Present only when capture is the selected sender. */
  captureEmailSender: CaptureEmailSender | undefined;
}

type SenderChoice = DevEmailSender | 'delivery-mode';

/**
 * Exactly one sender, chosen once: tests are capture, a production
 * environment (or a local NODE_ENV=production run) is Resend, a deployed
 * development or staging environment routes by the database delivery mode
 * over SMTP (its Mailpit) and Resend, and local development follows
 * `devSender` (default SMTP). Never falls back.
 */
export function createEmailSenders(config: EmailSenderConfig): EmailSenders {
  const { nodeEnv, environment, devSender, smtp, resend, appName } = config;
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
    const capture = new CaptureEmailSender(appName);
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
    });
  const smtpSender = () => new SmtpEmailSender({ ...smtp, appName });
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
