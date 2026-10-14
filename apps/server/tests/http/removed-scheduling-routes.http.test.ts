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
    async (instance) =>
      registerControllers({ app: instance, controllers: root.controllers }),
    {
      prefix: '/api/v1',
    },
  );
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
    { method: 'POST' as const, url: '/api/v1/events/some-id/slots' },
    { method: 'PATCH' as const, url: '/api/v1/events/some-id/slots/slot-id' },
    { method: 'DELETE' as const, url: '/api/v1/events/some-id/slots/slot-id' },
    { method: 'POST' as const, url: '/api/v1/events/some-id/slots/generate' },
    {
      method: 'PUT' as const,
      url: '/api/v1/events/some-id/slots/slot-id/requirements',
    },
    { method: 'POST' as const, url: '/api/v1/events/some-id/reminders' },
    { method: 'POST' as const, url: '/api/v1/events/some-id/cancel' },
    { method: 'POST' as const, url: '/api/v1/assignments' },
    { method: 'POST' as const, url: '/api/v1/assignments/some-id/override' },
    { method: 'DELETE' as const, url: '/api/v1/assignments/some-id' },
    { method: 'GET' as const, url: '/api/v1/assignments/some-id/audit' },
  ];

  for (const route of routes) {
    it(`${route.method} ${route.url} returns 404`, async () => {
      const response = await app.inject(route);
      expect(response.statusCode).toBe(404);
    });
  }
});
