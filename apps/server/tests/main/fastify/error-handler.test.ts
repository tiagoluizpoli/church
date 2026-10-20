import { m } from '@church/i18n/messages';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DuplicateHeadcountError } from '@/domain/errors/duplicate-headcount';
import { OverlappingCycleError } from '@/domain/errors/overlapping-cycle';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';

vi.mock('@church/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify();
  app.get('/boom/domain', async () => {
    throw new OverlappingCycleError();
  });
  app.get('/boom/headcount', async () => {
    throw new DuplicateHeadcountError();
  });
  app.get('/boom/crash', async () => {
    throw new Error('secret detail');
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
    });
  });

  it('renders the same code in en with the cookie', async () => {
    const res = await inject('/boom/domain', 'church_locale=en');
    expect(res.json()).toEqual({
      error: 'OVERLAPPING_CYCLE',
      message: m.error_overlapping_cycle({}, { locale: 'en' }),
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
    });
  });
});

describe('error handler logs', () => {
  it('logs the code and the English constructor message', async () => {
    const warn = vi.fn();
    const logged = await createFastify();
    logged.addHook('onRequest', async (request) => {
      request.log = { ...request.log, warn } as typeof request.log;
    });
    logged.get('/x', async () => {
      throw new OverlappingCycleError();
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
