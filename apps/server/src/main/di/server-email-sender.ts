import { appConfig } from '@church/app-config';
import { env } from '@church/env/server';
import type { EmailSender } from '../../domain/contracts/infrastructure/email-sender';
import { CaptureEmailSender } from '../../infrastructure/services/capture-email-sender';
import { ResendEmailSender } from '../../infrastructure/services/resend-email-sender';

/**
 * One shared capture instance outside production: the redemption debug route
 * reads back what the verification-code manager just sent through it, and
 * server auth mails password resets through the same sender.
 */
export const captureEmailSender =
  env.NODE_ENV === 'production'
    ? undefined
    : new CaptureEmailSender(appConfig.appName);

/** The sender server auth is built with; composition uses it unless overridden. */
export const serverEmailSender: EmailSender =
  captureEmailSender ??
  new ResendEmailSender({
    apiKey: env.RESEND_API_KEY ?? '',
    from: env.RESEND_FROM_EMAIL,
    appName: appConfig.appName,
  });
