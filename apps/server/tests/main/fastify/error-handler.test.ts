import { m } from '@church/i18n/messages';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DuplicateHeadcountError } from '@/domain/errors/duplicate-headcount';
import { OverlappingCycleError } from '@/domain/errors/overlapping-cycle';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  app.get('/boom/domain', async () => {
    throw new OverlappingCycleError({ conflictingCycles: [] });
  });
  app.get('/boom/headcount', async () => {
    throw new DuplicateHeadcountError();
  });
  app.get('/boom/crash', async () => {
    throw new Error('secret detail');
  });
  for (const code of [
    '08006',
    '08001',
    '57P01',
    '57P02',
    '57P03',
    '53300',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ECONNRESET',
  ]) {
    app.get(`/boom/conn/${code}`, async () => {
      throw Object.assign(new Error('connection failed'), { code });
    });
  }
  app.get('/boom/conn/wrapped', async () => {
    throw new Error('Failed query', {
      cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
    });
  });
  app.get('/boom/conn/unique', async () => {
    throw Object.assign(new Error('duplicate key'), { code: '23505' });
  });
  app.get(
    '/boom/query',
    { schema: { querystring: z.object({ n: z.coerce.number() }) } },
    async () => ({}),
  );
  await app.ready();
});

afterAll(async () => app.close());

const inject = (url: string, cookie?: string) =>
  app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });

describe('error handler locale', () => {
  it('renders a DomainError in pt-BR without a cookie', async () => {
    const res = await inject('/boom/domain');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'OVERLAPPING_CYCLE',
      message: m.error_overlapping_cycle({}, { locale: 'pt-BR' }),
      conflictingCycles: [],
    });
  });

  it('renders the same code in en with the cookie', async () => {
    const res = await inject('/boom/domain', 'church_locale=en');
    expect(res.json()).toEqual({
      error: 'OVERLAPPING_CYCLE',
      message: m.error_overlapping_cycle({}, { locale: 'en' }),
      conflictingCycles: [],
    });
  });

  it('falls back to pt-BR on an invalid cookie', async () => {
    const res = await inject('/boom/domain', 'church_locale=fr');
    expect(res.json().message).toBe(
      m.error_overlapping_cycle({}, { locale: 'pt-BR' }),
    );
  });

  it('keeps VALIDATION_ERROR and says what to fix for a duplicate head count', async () => {
    const res = await inject('/boom/headcount');
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({
      error: 'VALIDATION_ERROR',
      reason: 'DUPLICATE_HEADCOUNT',
      message: m.error_validation_duplicate_headcount({}, { locale: 'pt-BR' }),
    });
  });

  it('gives the generic validation message for a bad request', async () => {
    const res = await inject('/boom/query?n=abc');
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.message).toBe(
      m.common_validation_error({}, { locale: 'pt-BR' }),
    );
    expect(body.issues).toBeDefined();
  });

  it('gives the generic message for a 500 without leaking the detail', async () => {
    const res = await inject('/boom/crash');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: m.common_generic_error({}, { locale: 'pt-BR' }),
      requestId: res.headers['x-request-id'],
    });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{32}$/);
  });

  it("writes the unexpected error to stderr, so a failing test's 500 names its cause", async () => {
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const res = await inject('/boom/crash');
      const written = write.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(written).toContain('secret detail');
      expect(written).toContain(String(res.headers['x-request-id']));
    } finally {
      write.mockRestore();
    }
  });
});

describe('database connection failures', () => {
  it.each([
    '08006',
    '08001',
    '57P01',
    '57P02',
    '57P03',
    '53300',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ECONNRESET',
    'wrapped',
  ])('answers 503 with Retry-After for %s', async (code) => {
    const res = await inject(`/boom/conn/${code}`);
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe('5');
    expect(res.json()).toEqual({
      error: 'SERVICE_UNAVAILABLE',
      message: m.common_generic_error({}, { locale: 'pt-BR' }),
    });
  });

  it('keeps 500 for a non-connection SQLSTATE', async () => {
    const res = await inject('/boom/conn/unique');
    expect(res.statusCode).toBe(500);
    expect(res.headers['retry-after']).toBeUndefined();
  });
});

describe('error handler logs', () => {
  it('logs the code and the English constructor message', async () => {
    const warn = vi.fn();
    const logged = await createFastify({
      locale: testLocale,
      errorReporter: testErrorReporter,
    });
    logged.addHook('onRequest', async (request) => {
      request.log = { ...request.log, warn } as typeof request.log;
    });
    logged.get('/x', async () => {
      throw new OverlappingCycleError({ conflictingCycles: [] });
    });
    await logged.ready();
    await logged.inject({ method: 'GET', url: '/x' });
    expect(warn).toHaveBeenCalledWith(
      {
        code: 'OVERLAPPING_CYCLE',
        message: 'Cycle overlaps an existing cycle',
      },
      'DomainError',
    );
    await logged.close();
  });
});
