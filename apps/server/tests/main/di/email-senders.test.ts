import { describe, expect, it } from 'vitest';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';
import { DeliveryModeEmailSender } from '@/infrastructure/services/delivery-mode-email-sender';
import { ResendEmailSender } from '@/infrastructure/services/resend-email-sender';
import { SmtpEmailSender } from '@/infrastructure/services/smtp-email-sender';
import {
  createEmailSenders,
  type EmailSenderConfig,
} from '@/main/di/email-senders';

function config(overrides: Partial<EmailSenderConfig>): EmailSenderConfig {
  return {
    nodeEnv: 'development',
    environment: 'local',
    devSender: undefined,
    runtimeConfiguration: { findEmailDeliveryMode: async () => 'both' },
    appName: 'Church',
    resend: { apiKey: 'key', from: 'Church <a@b.test>' },
    smtp: {
      host: '127.0.0.1',
      port: 9,
      secure: false,
      from: 'Church <a@b.test>',
    },
    ...overrides,
  };
}

describe('createEmailSenders', () => {
  it.each([
    ['development', undefined, SmtpEmailSender],
    ['development', 'smtp', SmtpEmailSender],
    ['development', 'resend', ResendEmailSender],
    ['development', 'capture', CaptureEmailSender],
    ['test', undefined, CaptureEmailSender],
    ['test', 'smtp', CaptureEmailSender],
    ['test', 'resend', CaptureEmailSender],
    ['production', undefined, ResendEmailSender],
    ['production', 'smtp', ResendEmailSender],
    ['production', 'capture', ResendEmailSender],
  ] as const)('%s with %s selects the expected sender', (nodeEnv, devSender, expected) => {
    const { serverEmailSender } = createEmailSenders(
      config({ nodeEnv, devSender }),
    );
    expect(serverEmailSender).toBeInstanceOf(expected);
  });

  it.each([
    ['development', 'production', DeliveryModeEmailSender],
    ['staging', 'production', DeliveryModeEmailSender],
    ['staging', 'development', DeliveryModeEmailSender],
    ['production', 'production', ResendEmailSender],
    ['production', 'development', ResendEmailSender],
    ['staging', 'test', CaptureEmailSender],
  ] as const)('the %s environment under NODE_ENV=%s selects the expected sender', (environment, nodeEnv, expected) => {
    const { serverEmailSender } = createEmailSenders(
      config({ environment, nodeEnv, devSender: 'capture' }),
    );
    expect(serverEmailSender).toBeInstanceOf(expected);
  });

  it('requires Resend credentials in staging, so switching the mode later cannot fail at send', () => {
    expect(() =>
      createEmailSenders(
        config({
          environment: 'staging',
          resend: { apiKey: undefined, from: 'x' },
        }),
      ),
    ).toThrow(/RESEND_API_KEY/);
  });

  it('exposes capture inspection only when capture is the sender', () => {
    const capture = createEmailSenders(config({ devSender: 'capture' }));
    expect(capture.captureEmailSender).toBe(capture.serverEmailSender);
    for (const devSender of ['smtp', 'resend'] as const) {
      expect(
        createEmailSenders(config({ devSender })).captureEmailSender,
      ).toBeUndefined();
    }
    expect(
      createEmailSenders(config({ nodeEnv: 'production' })).captureEmailSender,
    ).toBeUndefined();
  });

  it('requires credentials when resend is selected, never falling back', () => {
    expect(() =>
      createEmailSenders(
        config({
          devSender: 'resend',
          resend: { apiKey: undefined, from: 'x' },
        }),
      ),
    ).toThrow(/RESEND_API_KEY/);
  });

  it.each([
    { user: 'mailer' },
    { password: 'secret' },
  ])('rejects incomplete SMTP credentials %o', (credentials) => {
    expect(() =>
      createEmailSenders(
        config({ smtp: { ...config({}).smtp, ...credentials } }),
      ),
    ).toThrow(/SMTP_USER and SMTP_PASSWORD/);
  });

  it('ignores SMTP settings when SMTP is not selected', () => {
    expect(() =>
      createEmailSenders(
        config({
          devSender: 'capture',
          smtp: { ...config({}).smtp, user: 'mailer' },
        }),
      ),
    ).not.toThrow();
  });

  it('starts when SMTP is unreachable and reports failure on send', async () => {
    const { serverEmailSender } = createEmailSenders(config({}));
    const email = serverEmailSender.prepare({
      payload: {
        kind: 'auth.password-reset',
        to: 'x@example.com',
        resetUrl: 'https://app.test/r',
        linkLifetime: { minutes: 5 },
      },
      locale: 'en',
    });
    await expect(serverEmailSender.deliver({ email })).rejects.toMatchObject({
      code: 'EMAIL_SEND_FAILED',
      retryable: true,
    });
  });
});
