import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerInjections } from '../../src/main/di/injections';
import { registerControllers } from '../../src/main/fastify/register-controllers';
import { createFastify } from '../../src/main/fastify/setup';
import type { FastifyTypedInstance } from '../../src/main/fastify/types';

let app: FastifyTypedInstance;

beforeAll(async () => {
  registerInjections();
  app = await createFastify();
  await app.register(
    async (instance) => {
      await registerControllers(instance);
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const ROUTES: Array<{ method: 'GET' | 'POST' | 'DELETE'; url: string }> = [
  { method: 'POST', url: '/api/v1/admin/assignments' },
  { method: 'DELETE', url: '/api/v1/admin/assignments/some-id' },
  { method: 'GET', url: '/api/v1/admin/assignments/some-id/audit' },
];

describe('Admin assignment routes authentication (T064)', () => {
  for (const { method, url } of ROUTES) {
    it(`${method} ${url} returns 401 without auth`, async () => {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
    });

    it(`${method} ${url} returns 401 with invalid token`, async () => {
      const res = await app.inject({
        method,
        url,
        headers: { cookie: 'better-auth.session_token=invalid-token' },
      });
      expect(res.statusCode).toBe(401);
    });
  }
});
