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

describe('GET /api/v1/admin/ministries (T038)', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ministries',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when session is invalid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ministries',
      headers: { cookie: 'better-auth.session_token=invalid-token' },
    });
    expect(res.statusCode).toBe(401);
  });
});
