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

const UNAUTH_ROUTES: Array<{
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
}> = [
  { method: 'GET', url: '/api/v1/admin/schedule-builder' },
  { method: 'GET', url: '/api/v1/admin/events' },
  { method: 'POST', url: '/api/v1/admin/events' },
  { method: 'POST', url: '/api/v1/admin/events/some-id/publish' },
  { method: 'POST', url: '/api/v1/admin/events/some-id/cancel' },
  { method: 'POST', url: '/api/v1/admin/events/some-id/reminders' },
  { method: 'POST', url: '/api/v1/admin/events/some-id/slots' },
  { method: 'PATCH', url: '/api/v1/admin/events/some-id/slots/slot-id' },
  { method: 'DELETE', url: '/api/v1/admin/events/some-id/slots/slot-id' },
  { method: 'POST', url: '/api/v1/admin/events/some-id/slots/generate' },
  {
    method: 'PUT',
    url: '/api/v1/admin/events/some-id/slots/slot-id/requirements',
  },
];

describe('Admin event routes authentication (T056)', () => {
  for (const { method, url } of UNAUTH_ROUTES) {
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
