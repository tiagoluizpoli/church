import { NotFoundError } from '@church/core';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RefusalCode } from '@/api/utils/error-table.types';
import { RefusalError } from '@/api/utils/refusal-error';
import { refuse } from '@/api/utils/refuse';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const CODES: RefusalCode[] = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'ACTIVE_CHURCH_SELECTION_REQUIRED',
  'RATE_LIMITED',
  'INVITATION_UNAVAILABLE',
  'LAST_CHURCH_ADMIN',
];

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  for (const code of CODES) {
    app.get(`/sent/${code}`, async (request, reply) =>
      refuse({ reply, request, code }),
    );
  }
  for (const code of CODES) {
    app.get(`/thrown/${code}`, async () => {
      throw new RefusalError({ code });
    });
    app.get(
      `/hook/${code}`,
      {
        preValidation: async () => {
          throw new RefusalError({ code });
        },
      },
      async () => ({ reached: true }),
    );
  }
  app.get('/thrown/not-found', async () => {
    throw new NotFoundError('Assignment not found');
  });
  await app.ready();
});

afterAll(async () => app.close());

/** Everything a client sees, but the per-request id. */
function wire(response: LightMyRequestResponse) {
  const { 'x-request-id': _requestId, ...headers } = response.headers;
  return { status: response.statusCode, headers, body: response.payload };
}

const get = (url: string, cookie?: string) =>
  app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });

describe('refusal responses', () => {
  it.each(
    CODES.flatMap((code) => [
      [code, undefined],
      [code, 'church_locale=en'],
    ]),
  )('a thrown %s refusal answers exactly as refusing it (cookie %s)', async (code, cookie) => {
    const sent = await get(`/sent/${code}`, cookie);
    const thrown = await get(`/thrown/${code}`, cookie);
    const hooked = await get(`/hook/${code}`, cookie);
    expect(wire(thrown)).toEqual(wire(sent));
    expect(wire(hooked)).toEqual(wire(sent));
  });

  it.each([
    undefined,
    'church_locale=en',
  ])('a thrown NotFoundError answers exactly as refusing NOT_FOUND (cookie %s)', async (cookie) => {
    const sent = await get('/sent/NOT_FOUND', cookie);
    const thrown = await get('/thrown/not-found', cookie);
    expect(sent.statusCode).toBe(404);
    expect(wire(thrown)).toEqual(wire(sent));
  });
});
