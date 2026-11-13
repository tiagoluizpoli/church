import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DeliverEmailInput,
  EmailDestination,
  EmailRouting,
} from '@/domain/contracts/infrastructure/email-sender';
import { EmailSendError } from '@/domain/errors/email-send-error';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';
import { DeliveryModeEmailSender } from '@/infrastructure/services/delivery-mode-email-sender';

/** A provider fake: records what it accepted and fails on demand. */
class FakeProvider extends CaptureEmailSender {
  failNext: EmailSendError | undefined;

  override async deliver(input: DeliverEmailInput) {
    const failure = this.failNext;
    this.failNext = undefined;
    if (failure) throw failure;
    await super.deliver(input);
    return { providerMessageId: 'provider-id' };
  }
}

interface Harness {
  mailpit: FakeProvider;
  resend: FakeProvider;
  sender: DeliveryModeEmailSender;
  readMode: ReturnType<typeof vi.fn>;
}

interface HarnessInput {
  mode: unknown;
}

function harness({ mode }: HarnessInput): Harness {
  const mailpit = new FakeProvider('Church');
  const resend = new FakeProvider('Church');
  const readMode = vi.fn().mockResolvedValue(mode);
  const sender = new DeliveryModeEmailSender({
    mailpit,
    resend,
    runtimeConfiguration: { findEmailDeliveryMode: readMode },
  });
  return { mailpit, resend, sender, readMode };
}

const payload = {
  kind: 'auth.password-reset',
  to: 'tester@example.test',
  resetUrl: 'https://app.test/reset-password?token=t',
  linkLifetime: { hours: 1 },
} as const;

interface RoutingInput {
  frozenMode: unknown;
  confirmed?: EmailDestination[];
}

interface RecordingRouting extends EmailRouting {
  confirmations: EmailDestination[];
}

function routing({
  frozenMode,
  confirmed = [],
}: RoutingInput): RecordingRouting {
  const confirmations: EmailDestination[] = [];
  return {
    frozenMode,
    confirmed,
    confirmations,
    confirm: async ({ destination }) => {
      confirmations.push(destination);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeliveryModeEmailSender', () => {
  it.each([
    ['mailpit', 1, 0],
    ['resend', 0, 1],
    ['both', 1, 1],
  ] as const)('a direct email in %s mode reaches the chosen destinations', async (mode, mailpitCount, resendCount) => {
    const { sender, mailpit, resend } = harness({ mode: mode });

    await sender.send({ payload, locale: 'en' });

    expect(mailpit.delivered).toHaveLength(mailpitCount);
    expect(resend.delivered).toHaveLength(resendCount);
  });

  it('reads the mode when each direct email is created, without a restart', async () => {
    const { sender, mailpit, resend, readMode } = harness({ mode: 'mailpit' });
    await sender.send({ payload, locale: 'en' });
    readMode.mockResolvedValue('resend');
    await sender.send({ payload, locale: 'en' });

    expect(mailpit.delivered).toHaveLength(1);
    expect(resend.delivered).toHaveLength(1);
  });

  it.each([
    [undefined],
    ['RESEND'],
    [{ mode: 'both' }],
    ['toString'],
  ])('a missing or invalid mode %o delivers to Mailpit only and logs without the value', async (mode) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sender, mailpit, resend } = harness({ mode: mode });

    await sender.send({ payload, locale: 'en' });

    expect(mailpit.delivered).toHaveLength(1);
    expect(resend.delivered).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('email_delivery_mode'),
    );
  });

  it('propagates a database failure instead of choosing Mailpit', async () => {
    const { sender, mailpit, resend, readMode } = harness({ mode: 'mailpit' });
    readMode.mockRejectedValue(new Error('connection refused'));

    await expect(sender.send({ payload, locale: 'en' })).rejects.toThrow(
      'connection refused',
    );
    expect(mailpit.delivered).toHaveLength(0);
    expect(resend.delivered).toHaveLength(0);
  });

  it('prepares with the Resend sender address, so both destinations get one request', () => {
    const { sender, resend } = harness({ mode: 'both' });
    expect(sender.prepare({ payload, locale: 'en' })).toEqual(
      resend.prepare({ payload, locale: 'en' }),
    );
  });

  it('follows the frozen mode of a queued email, not the current setting', async () => {
    const { sender, mailpit, resend, readMode } = harness({ mode: 'resend' });
    const email = sender.prepare({ payload, locale: 'en' });

    await sender.deliver({
      email,
      routing: routing({ frozenMode: 'mailpit' }),
    });

    expect(readMode).not.toHaveBeenCalled();
    expect(mailpit.delivered).toHaveLength(1);
    expect(resend.delivered).toHaveLength(0);
  });

  it('in both mode confirms the destination that succeeded and fails retryably for the other', async () => {
    const { sender, mailpit, resend } = harness({ mode: 'both' });
    resend.failNext = new EmailSendError({ message: 'down', retryable: true });
    const email = sender.prepare({ payload, locale: 'en' });
    const first = routing({ frozenMode: 'both' });

    await expect(
      sender.deliver({ email, routing: first }),
    ).rejects.toMatchObject({
      retryable: true,
      message: 'resend: down',
    });
    expect(first.confirmations).toEqual(['mailpit']);

    const retry = routing({ frozenMode: 'both', confirmed: ['mailpit'] });
    await sender.deliver({
      email,
      idempotencyKey: 'outbox-message/1',
      routing: retry,
    });

    expect(mailpit.delivered).toHaveLength(1);
    expect(resend.delivered).toHaveLength(1);
    expect(retry.confirmations).toEqual(['resend']);
  });

  it('passes the stable idempotency key to Resend on every retry', async () => {
    const { sender, resend } = harness({ mode: 'both' });
    const spy = vi.spyOn(resend, 'deliver');
    resend.failNext = new EmailSendError({ message: 'down', retryable: true });
    const email = sender.prepare({ payload, locale: 'en' });
    const idempotencyKey = 'outbox-message/1';
    await sender
      .deliver({
        email,
        idempotencyKey,
        routing: routing({ frozenMode: 'both' }),
      })
      .catch(() => {});
    await sender.deliver({
      email,
      idempotencyKey,
      routing: routing({ frozenMode: 'both', confirmed: ['mailpit'] }),
    });

    expect(spy.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([
      idempotencyKey,
      idempotencyKey,
    ]);
  });

  it('is terminal when any failed destination is terminal', async () => {
    const { sender, mailpit } = harness({ mode: 'both' });
    mailpit.failNext = new EmailSendError({ message: 'bad', retryable: false });
    const email = sender.prepare({ payload, locale: 'en' });

    await expect(
      sender.deliver({ email, routing: routing({ frozenMode: 'both' }) }),
    ).rejects.toMatchObject({ retryable: false });
  });
});
