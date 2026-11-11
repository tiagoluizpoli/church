import { appConfig } from '@church/app-config';
import { env } from '@church/env/server';
import { createEmailSenders } from './email-senders';

const senders = createEmailSenders({
  nodeEnv: env.NODE_ENV,
  devSender: env.DEV_EMAIL_SENDER,
  appName: appConfig.appName,
  resend: { apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM_EMAIL },
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTls: env.SMTP_REQUIRE_TLS,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.SMTP_FROM_EMAIL,
  },
});

/**
 * The one capture instance, only when capture is selected: the redemption
 * debug route reads back what the verification-code manager just sent, and
 * server auth mails password resets through the same sender.
 */
export const captureEmailSender = senders.captureEmailSender;

/** The sender server auth is built with; composition uses it unless overridden. */
export const serverEmailSender = senders.serverEmailSender;
