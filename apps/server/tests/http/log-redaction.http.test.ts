import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
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
});
