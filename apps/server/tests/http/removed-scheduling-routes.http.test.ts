import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerInjections } from '../../src/main/di/injections';
import { registerControllers } from '../../src/main/fastify/register-controllers';
import { createFastify } from '../../src/main/fastify/setup';
import type { FastifyTypedInstance } from '../../src/main/fastify/types';

let app: FastifyTypedInstance;

beforeAll(async () => {
  registerInjections();
  app = await createFastify();
  await app.register(async (instance) => registerControllers(instance), {
    prefix: '/api/v1',
  });
  await app.ready();
});

afterAll(async () => app.close());

describe('removed scheduling routes', () => {
  const routes = [
    { method: 'GET' as const, url: '/api/v1/admin/role-templates' },
    { method: 'PUT' as const, url: '/api/v1/admin/role-templates/legacy' },
    { method: 'DELETE' as const, url: '/api/v1/admin/role-templates/legacy' },
    { method: 'POST' as const, url: '/api/v1/admin/events/legacy/publish' },
    {
      method: 'POST' as const,
      url: '/api/v1/admin/events/legacy/apply-template',
    },
    { method: 'PUT' as const, url: '/api/v1/volunteer/availability' },
  ];

  for (const route of routes) {
    it(`${route.method} ${route.url} returns 404`, async () => {
      const response = await app.inject(route);
      expect(response.statusCode).toBe(404);
    });
  }
});
