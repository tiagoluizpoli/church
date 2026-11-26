import { appConfig } from '@church/app-config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCompositionRoot } from '@/main/di/composition-root';
import { registerControllers } from '@/main/fastify/register-controllers';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

let app: FastifyTypedInstance;

beforeAll(async () => {
  const root = createCompositionRoot({ config: appConfig });
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
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

const ROUTES: Array<{
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
}> = [
  { method: 'GET', url: '/api/v1/volunteer/dashboard' },
  { method: 'GET', url: '/api/v1/volunteer/schedule' },
  { method: 'GET', url: '/api/v1/volunteer/ministries/some-id/schedule' },
  { method: 'GET', url: '/api/v1/volunteer/availability-checks' },
  { method: 'GET', url: '/api/v1/volunteer/availability-checks/some-id' },
  {
    method: 'PUT',
    url: '/api/v1/volunteer/availability-checks/some-id/answer',
  },
];

describe('Volunteer routes authentication (T047)', () => {
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
