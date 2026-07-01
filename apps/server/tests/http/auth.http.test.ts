import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFastify } from '../../src/main/fastify/setup';
import type { FastifyTypedInstance } from '../../src/main/fastify/types';

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify();
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

  it('GET /api/v1/nonexistent returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});
