import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCompositionRoot } from '@/main/di/composition-root';
import { registerControllers } from '@/main/fastify/register-controllers';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testLocale } from '@/tests/test-support/fastify-locale';

let app: FastifyTypedInstance;

beforeAll(async () => {
  const root = createCompositionRoot();
  app = await createFastify({ locale: testLocale });
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

describe('removed feature-flags route', () => {
  it('GET /api/v1/feature-flags/ returns 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/feature-flags/',
    });
    expect(response.statusCode).toBe(404);
  });
});
