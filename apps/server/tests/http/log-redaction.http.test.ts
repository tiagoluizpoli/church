import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

const TOKEN = 'reset-token-SECRET';
const COOKIE = 'better-auth.session_token=SESSION-SECRET';
const BEARER = 'Bearer BEARER-SECRET';
const BODY_SECRET = 'body-secret-password';

let app: FastifyTypedInstance;
let lines: string[];

beforeEach(async () => {
  lines = [];
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
    logStream: { write: (line: string) => lines.push(line) },
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('server log redaction', () => {
  it('logs a masked path with no query, IP, cookie, authorization or body', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/auth/reset-password/${TOKEN}?token=${TOKEN}&email=a@b.test`,
      remoteAddress: '203.0.113.9',
      headers: {
        cookie: COOKIE,
        authorization: BEARER,
        'user-agent': 'redaction-test',
      },
      payload: { newPassword: BODY_SECRET },
    });

    const log = lines.join('');
    expect(log).toContain('/api/auth/reset-password/:redacted');
    expect(log).toContain('redaction-test');
    for (const secret of [
      TOKEN,
      'a@b.test',
      '203.0.113.9',
      COOKIE,
      'SESSION-SECRET',
      'BEARER-SECRET',
      BODY_SECRET,
    ]) {
      expect(log).not.toContain(secret);
    }
  });

  it('logs an unhandled error by type and stack frames, never its message', async () => {
    app = await createFastify({
      locale: testLocale,
      errorReporter: testErrorReporter,
      logStream: { write: (line: string) => lines.push(line) },
    });
    app.get('/boom', async () => {
      throw new TypeError('failed for a@b.test');
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/boom' });

    expect(res.statusCode).toBe(500);
    const entry = lines
      .map((line) => JSON.parse(line))
      .find((parsed) => parsed.msg === 'Unhandled error');
    expect(entry?.err.type).toBe('TypeError');
    expect(entry?.err.stack).toMatch(/^ {4}at /);
    expect(lines.join('')).not.toContain('a@b.test');
  });
});
