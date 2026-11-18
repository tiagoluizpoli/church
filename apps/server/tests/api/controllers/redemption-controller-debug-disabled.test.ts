import { appConfig } from '@church/app-config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RedemptionController } from '@/api/controllers/redemption-controller';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));
// As in production: the debug routes are never registered.
vi.mock('@/api/utils/debug-endpoints', () => ({
  debugEndpointsEnabled: () => false,
}));

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const controller = new RedemptionController({
    redemptionManager: {} as never,
    volunteerTransferManager: {} as never,
    config: appConfig,
  });
  await app.register(
    async (instance) => {
      instance.register(controller.registerRoutes.bind(controller), {
        prefix: controller.prefix,
      });
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('redemption debug routes with debug endpoints disabled', () => {
  it.each([
    '/api/v1/redemption/church/11111111-1111-4111-8111-111111111111/debug-code',
    '/api/v1/redemption/debug-invitation-link?email=invitee%40example.com',
  ])('does not register %s', async (url) => {
    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(404);
  });
});
