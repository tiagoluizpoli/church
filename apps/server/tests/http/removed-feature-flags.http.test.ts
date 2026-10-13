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

describe('removed feature-flags route', () => {
  it('GET /api/v1/feature-flags/ returns 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/feature-flags/',
    });
    expect(response.statusCode).toBe(404);
  });
});
