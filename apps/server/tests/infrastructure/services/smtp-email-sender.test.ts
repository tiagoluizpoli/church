import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SmtpEmailSender } from '@/infrastructure/services/smtp-email-sender';

interface Received {
  from: string;
  to: string[];
  raw: string;
}

let server: SMTPServer;
let received: Received[];
let rejectWith: number | undefined;
let rejectAddress: string | undefined;
let authRequired = false;

beforeEach(async () => {
  received = [];
  rejectWith = undefined;
  rejectAddress = undefined;
  authRequired = false;
  server = new SMTPServer({
    get authOptional() {
      return !authRequired;
    },
    onAuth(auth, _session, callback) {
      if (auth.username === 'mailer' && auth.password === 'secret') {
        return callback(null, { user: 'mailer' });
      }
      callback(new Error('Invalid login'));
    },
    disabledCommands: ['STARTTLS'],
    onRcptTo(address, _session, callback) {
      if (rejectWith && (!rejectAddress || address.address === rejectAddress)) {
        const error = Object.assign(new Error('rejected'), {
          responseCode: rejectWith,
        });
        return callback(error);
      }
      callback();
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        received.push({
          from: session.envelope.mailFrom
            ? session.envelope.mailFrom.address
            : '',
          to: session.envelope.rcptTo.map((recipient) => recipient.address),
          raw: Buffer.concat(chunks).toString('utf8'),
        });
        callback();
      });
    },
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
});

afterEach(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

function sender(
  extra: { user?: string; password?: string; requireTls?: boolean } = {},
) {
  const { port } = server.server.address() as AddressInfo;
  return new SmtpEmailSender({
    host: '127.0.0.1',
    port,
    secure: false,
    ...extra,
    from: 'Church <noreply@church.test>',
    appName: 'Church',
  });
}

const payload = {
  kind: 'auth.password-reset',
  to: 'real.person@example.com',
  resetUrl: 'https://app.test/reset?token=abc',
  linkLifetime: { minutes: 5 },
} as const;

describe('SmtpEmailSender', () => {
  it('delivers the prepared email to its original recipient with html and text', async () => {
    const smtp = sender();
    const email = smtp.prepare({ payload, locale: 'en' });
    await smtp.deliver({ email });

    expect(received).toHaveLength(1);
    expect(received[0]?.to).toEqual(['real.person@example.com']);
    expect(received[0]?.raw).toContain(`Subject: ${email.request.subject}`);
    expect(received[0]?.raw).toContain('text/html');
    expect(received[0]?.raw).toContain('text/plain');
  });

  it('replays a historical html-only request without adding text', async () => {
    const smtp = sender();
    const prepared = smtp.prepare({ payload, locale: 'en' });
    const { text: _text, ...htmlOnly } = prepared.request;
    await smtp.deliver({ email: { ...prepared, request: htmlOnly } });

    expect(received[0]?.raw).toContain('text/html');
    expect(received[0]?.raw).not.toContain('text/plain');
  });

  it('sends to every recipient of a multi-recipient request', async () => {
    const smtp = sender();
    const prepared = smtp.prepare({ payload, locale: 'en' });
    await smtp.deliver({
      email: {
        ...prepared,
        request: {
          ...prepared.request,
          to: ['a@example.com', 'b@example.com'],
        },
      },
    });
    expect(received[0]?.to).toEqual(['a@example.com', 'b@example.com']);
  });

  it('marks a permanent rejection non-retryable and a temporary one retryable', async () => {
    const smtp = sender();
    const email = smtp.prepare({ payload, locale: 'en' });

    rejectWith = 550;
    await expect(smtp.deliver({ email })).rejects.toMatchObject({
      code: 'EMAIL_SEND_FAILED',
      retryable: false,
    });
    rejectWith = 451;
    await expect(smtp.deliver({ email })).rejects.toMatchObject({
      retryable: true,
    });
  });

  it.each([
    [550, false],
    [451, true],
  ])('fails a send where only some recipients were accepted (%i, retryable %s)', async (code, retryable) => {
    const smtp = sender();
    const prepared = smtp.prepare({ payload, locale: 'en' });
    rejectWith = code;
    rejectAddress = 'bad@example.com';
    const error = await smtp
      .deliver({
        email: {
          ...prepared,
          request: {
            ...prepared.request,
            to: ['good@example.com', 'bad@example.com'],
          },
        },
      })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'EMAIL_SEND_FAILED', retryable });
    expect((error as Error).message).toContain('bad@example.com');
    expect(received[0]?.to).toEqual(['good@example.com']);
  });

  it('marks an unreachable server retryable', async () => {
    const down = new SmtpEmailSender({
      host: '127.0.0.1',
      port: 9,
      secure: false,
      from: 'Church <noreply@church.test>',
      appName: 'Church',
    });
    const email = down.prepare({ payload, locale: 'en' });
    await expect(down.deliver({ email })).rejects.toMatchObject({
      retryable: true,
    });
  });

  it('authenticates with the configured credentials', async () => {
    authRequired = true;
    const smtp = sender({ user: 'mailer', password: 'secret' });
    await smtp.deliver({ email: smtp.prepare({ payload, locale: 'en' }) });
    expect(received).toHaveLength(1);
  });

  it('reports rejected credentials as a permanent failure, never delivering', async () => {
    authRequired = true;
    const smtp = sender({ user: 'mailer', password: 'wrong' });
    await expect(
      smtp.deliver({ email: smtp.prepare({ payload, locale: 'en' }) }),
    ).rejects.toMatchObject({ code: 'EMAIL_SEND_FAILED', retryable: false });
    expect(received).toHaveLength(0);
  });

  it('refuses to send in plaintext when TLS is required', async () => {
    const smtp = sender({ requireTls: true });
    await expect(
      smtp.deliver({ email: smtp.prepare({ payload, locale: 'en' }) }),
    ).rejects.toMatchObject({ code: 'EMAIL_SEND_FAILED' });
    expect(received).toHaveLength(0);
  });
});
