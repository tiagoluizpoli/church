import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFastify } from '@/main/fastify/setup';
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

describe('Auth passthrough (T031)', () => {
  it('GET /api/auth/get-session is not 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
    });
    expect(res.statusCode).not.toBe(404);
  });

  it('POST /api/auth/sign-in/email is not 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: 'test@test.com', password: 'wrong' },
    });
    expect(res.statusCode).not.toBe(404);
  });

  it('returns Not Found for public credential sign-up', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: 'stranger@example.test',
        name: 'Stranger',
        password: 'correct-horse-battery-staple',
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('Not Found');
  });

  it('returns Not Found for public Church role changes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/organization/update-member-role',
      payload: {
        memberId: 'member-id',
        organizationId: 'organization-id',
        role: 'admin',
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('Not Found');
  });

  it('returns Not Found for Church identity updates around the app', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/organization/update',
      payload: {
        organizationId: 'organization-id',
        data: { name: 'Renamed', slug: 'renamed', logo: 'x' },
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('Not Found');
  });

  it("returns Not Found for Better Auth's slug check, which would name another Church's slug", async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/organization/check-slug',
      payload: { slug: 'ib-esperanca' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('Not Found');
  });

  it('GET /api/v1/nonexistent returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});
