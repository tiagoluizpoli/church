import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCompositionRoot } from '../../src/main/di/injections';
import { registerControllers } from '../../src/main/fastify/register-controllers';
import { createFastify } from '../../src/main/fastify/setup';
import type { FastifyTypedInstance } from '../../src/main/fastify/types';

let app: FastifyTypedInstance;

beforeAll(async () => {
  const root = createCompositionRoot();
  app = await createFastify();
  await app.register(
    async (instance) => {
      await registerControllers({
        app: instance,
        controllers: root.controllers,
      });
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
  { method: 'GET', url: '/api/v1/events/schedule-builder' },
  { method: 'GET', url: '/api/v1/events' },
];

describe('Event and TimeSlot routes authentication (T056)', () => {
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
