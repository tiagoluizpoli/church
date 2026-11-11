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

beforeEach(async () => {
  received = [];
  rejectWith = undefined;
  server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onRcptTo(_address, _session, callback) {
      if (rejectWith) {
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

function sender() {
  const { port } = server.server.address() as AddressInfo;
  return new SmtpEmailSender({
    host: '127.0.0.1',
    port,
    secure: false,
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
});
