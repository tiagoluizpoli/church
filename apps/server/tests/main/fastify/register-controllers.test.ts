import { appConfig, withAllParkedOn } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCompositionRoot } from '@/main/di/composition-root';
import { registerControllers } from '@/main/fastify/register-controllers';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

type OpenApiOperation = {
  operationId?: string;
  responses?: Record<string, unknown>;
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  // As the OpenAPI export builds it: parked routes stay in the contract.
  const root = createCompositionRoot({ config: withAllParkedOn(appConfig) });
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  await app.register(
    async (instance) =>
      registerControllers({ app: instance, controllers: root.controllers }),
    { prefix: '/api/v1' },
  );
  await app.ready();
});

afterAll(async () => app.close());

function declaredStatuses({ operationId }: { operationId: string }): string[] {
  const paths = app.swagger().paths as Record<
    string,
    Record<string, OpenApiOperation>
  >;
  for (const item of Object.values(paths)) {
    for (const operation of Object.values(item)) {
      if (operation.operationId === operationId) {
        return Object.keys(operation.responses ?? {}).sort();
      }
    }
  }
  throw new Error(`No operation ${operationId}`);
}

const ID = '11111111-1111-4111-8111-111111111111';

describe('the Active Church hook refusal body', () => {
  // A declared response schema serializes the body: it must stay exactly
  // the `{ error, message }` the hook sends.
  it.each([
    ['GET', '/api/v1/volunteer/dashboard'],
    ['GET', '/api/v1/volunteer/schedule'],
    ['POST', `/api/v1/volunteer/assignments/${ID}/swap-requests`],
    ['DELETE', `/api/v1/volunteer/assignments/${ID}/swap-requests/current`],
    ['GET', `/api/v1/ministries/${ID}/swap-requests`],
    ['POST', `/api/v1/ministries/${ID}/swap-requests/${ID}/keep`],
    ['GET', `/api/v1/assign/cycles/${ID}/builder`],
    ['DELETE', `/api/v1/assign/assignments/${ID}`],
    ['GET', '/api/v1/people/'],
    ['GET', '/api/v1/admin/setup-progress'],
    ['DELETE', `/api/v1/admin/cycles/${ID}`],
    ['DELETE', `/api/v1/admin/event-templates/${ID}`],
    ['GET', '/api/v1/notifications'],
  ] as const)('%s %s answers 401 without a session', async (method, url) => {
    const response = await app.inject({ method, url });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'UNAUTHORIZED',
      message: m.error_unauthorized({}, { locale: testLocale.defaultLocale }),
    });
  });
});

describe('declared response statuses', () => {
  // The hook sends 409 until an Active Church is chosen and the querystring
  // refuses a bad cursor or page size with 422 (notification-controller tests).
  it('getNotifications keeps the 409 and 422 it sends', () => {
    expect(declaredStatuses({ operationId: 'getNotifications' })).toEqual([
      '200',
      '401',
      '403',
      '409',
      '422',
    ]);
  });
});
