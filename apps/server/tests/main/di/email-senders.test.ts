import { describe, expect, it } from 'vitest';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';
import { ResendEmailSender } from '@/infrastructure/services/resend-email-sender';
import { SmtpEmailSender } from '@/infrastructure/services/smtp-email-sender';
import {
  createEmailSenders,
  type EmailSenderConfig,
} from '@/main/di/email-senders';

function config(overrides: Partial<EmailSenderConfig>): EmailSenderConfig {
  return {
    nodeEnv: 'development',
    devSender: undefined,
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
