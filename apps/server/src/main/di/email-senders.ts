import type { EmailSender } from '../../domain/contracts/infrastructure/email-sender';
import { CaptureEmailSender } from '../../infrastructure/services/capture-email-sender';
import { ResendEmailSender } from '../../infrastructure/services/resend-email-sender';
import { SmtpEmailSender } from '../../infrastructure/services/smtp-email-sender';

export type DevEmailSender = 'smtp' | 'resend' | 'capture';

export interface EmailSenderConfig {
  nodeEnv: 'development' | 'production' | 'test';
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

/**
 * Exactly one sender, chosen once: production is Resend, tests are capture,
 * development follows `devSender` (default SMTP). Never falls back.
 */
export function createEmailSenders(config: EmailSenderConfig): EmailSenders {
  const choice: DevEmailSender =
    config.nodeEnv === 'production'
      ? 'resend'
      : config.nodeEnv === 'test'
        ? 'capture'
        : (config.devSender ?? 'smtp');

  if (choice === 'capture') {
    const capture = new CaptureEmailSender(config.appName);
    return { serverEmailSender: capture, captureEmailSender: capture };
  }
  if (
    choice === 'smtp' &&
    Boolean(config.smtp.user) !== Boolean(config.smtp.password)
  ) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must be set together.');
  }
  const serverEmailSender =
    choice === 'resend'
      ? new ResendEmailSender({
          apiKey: config.resend.apiKey ?? '',
          from: config.resend.from,
          appName: config.appName,
        })
      : new SmtpEmailSender({ ...config.smtp, appName: config.appName });
  return { serverEmailSender, captureEmailSender: undefined };
}
