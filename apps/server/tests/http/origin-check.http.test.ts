import { env } from '@church/env/server';
import { m } from '@church/i18n/messages';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFastify, DESKTOP_ORIGIN } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const signIn = (headers: Record<string, string>) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers,
    payload: { email: 'nobody@test.com', password: 'wrong' },
  });

describe('Global Origin check', () => {
  it('refuses a mutating request from another Origin with the standard error body, in the request locale', async () => {
    const res = await signIn({
      origin: 'https://evil.example',
      cookie: `${testLocale.localeCookieName}=en`,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: 'FORBIDDEN',
      message: m.error_forbidden({}, { locale: 'en' }),
    });
  });

  it('refuses a cross-site mutating request without an allowed Origin', async () => {
    const res = await signIn({ 'sec-fetch-site': 'cross-site' });
    expect(res.statusCode).toBe(403);
  });

  it.each([env.CORS_ORIGIN, DESKTOP_ORIGIN])('allows %s', async (origin) => {
    const res = await signIn({ origin });
    expect(res.statusCode).not.toBe(403);
  });

  it('allows a non-browser client without Origin', async () => {
    const res = await signIn({});
    expect(res.statusCode).not.toBe(403);
  });

  it('never blocks GET', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.statusCode).not.toBe(403);
  });
});
