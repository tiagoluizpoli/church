import { m } from '@church/i18n/messages';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const TRACEPARENT = `00-${TRACE_ID}-00f067aa0ba902b7-01`;

const logLines: Record<string, unknown>[] = [];
let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
    logStream: { write: (line: string) => logLines.push(JSON.parse(line)) },
  });
  app.get('/ok', async () => ({ ok: true }));
  app.get('/boom', async () => {
    throw new Error('secret detail');
  });
  await app.ready();
});

afterAll(async () => app.close());

const inject = (url: string, traceparent?: string) =>
  app.inject({
    method: 'GET',
    url,
    headers: traceparent ? { traceparent } : {},
  });

describe('request id', () => {
  it("returns an incoming traceparent's trace id and logs it on every line", async () => {
    logLines.length = 0;
    const res = await inject('/ok', TRACEPARENT);
    expect(res.headers['x-request-id']).toBe(TRACE_ID);
    expect(logLines.length).toBeGreaterThan(0);
    expect(logLines.map((line) => line.reqId)).toEqual(
      logLines.map(() => TRACE_ID),
    );
  });

  it.each([
    ['no traceparent', undefined],
    ['an unknown version', `01-${TRACE_ID}-00f067aa0ba902b7-01`],
    ['an all-zero trace id', `00-${'0'.repeat(32)}-00f067aa0ba902b7-01`],
    ['an all-zero parent id', `00-${TRACE_ID}-${'0'.repeat(16)}-01`],
    ['uppercase hex', `00-${TRACE_ID.toUpperCase()}-00f067aa0ba902b7-01`],
    ['garbage', 'not-a-traceparent'],
  ])('generates a fresh valid trace id for %s', async (_case, traceparent) => {
    const first = await inject('/ok', traceparent);
    const second = await inject('/ok', traceparent);
    const id = first.headers['x-request-id'];
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toBe('0'.repeat(32));
    expect(id).not.toBe(TRACE_ID);
    expect(second.headers['x-request-id']).not.toBe(id);
  });

  it("carries the same id in an unhandled error's 500 envelope", async () => {
    const res = await inject('/boom', TRACEPARENT);
    expect(res.statusCode).toBe(500);
    expect(res.headers['x-request-id']).toBe(TRACE_ID);
    expect(res.json()).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: m.common_generic_error({}, { locale: 'pt-BR' }),
      requestId: TRACE_ID,
    });
  });
});
