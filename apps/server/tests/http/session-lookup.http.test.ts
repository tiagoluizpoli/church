import { appConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { APIError } from 'better-auth/api';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ActiveChurchController } from '@/api/controllers/active-church-controller';
import { CallerCapabilitiesController } from '@/api/controllers/caller-capabilities-controller';
import { RedemptionController } from '@/api/controllers/redemption-controller';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { testSessionGateway } from '@/tests/test-support/session-gateway';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const INVITATION_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_COOKIE = 'better-auth.session_token=session-token';
const UNAUTHORIZED_BODY = {
  error: 'UNAUTHORIZED',
  message: 'Autenticação necessária.',
};

const activeChurchResolver = { resolve: vi.fn() };
// Empty on purpose: a refused session must stop before any of them runs.
const none = {} as never;

/** One route per session entry point: pre-validation, active-church, redemption. */
const ENTRY_POINTS = [
  ['Active Church pre-validation', '/api/v1/caller-capabilities'],
  ['active-church', '/api/v1/active-church/status'],
  ['redemption', `/api/v1/redemption/ministry/${INVITATION_ID}`],
] as const;

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const controllers = [
    new CallerCapabilitiesController({
      sessionGateway: testSessionGateway(),
      activeChurchResolver: activeChurchResolver as never,
      authorityGuard: none,
    }),
    new ActiveChurchController({
      sessionGateway: testSessionGateway(),
      activeChurchResolver: activeChurchResolver as never,
      selectionManager: none,
    }),
    new RedemptionController({
      sessionGateway: testSessionGateway(),
      redemptionManager: none,
      volunteerTransferManager: none,
      config: appConfig,
    }),
  ];
  await app.register(
    async (instance) => {
      for (const controller of controllers) {
        instance.register(controller.registerRoutes.bind(controller), {
          prefix: controller.prefix,
        });
      }
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe.each(ENTRY_POINTS)('%s session lookup', (_name, url) => {
  it('answers 401 when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url,
      headers: { cookie: AUTH_COOKIE },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(UNAUTHORIZED_BODY);
    expect(activeChurchResolver.resolve).not.toHaveBeenCalled();
  });

  it('answers 401 when Better Auth refuses the session with its own 401', async () => {
    mockGetSession.mockRejectedValueOnce(new APIError('UNAUTHORIZED'));

    const response = await app.inject({
      method: 'GET',
      url,
      headers: { cookie: AUTH_COOKIE },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(UNAUTHORIZED_BODY);
    expect(activeChurchResolver.resolve).not.toHaveBeenCalled();
  });

  it.each([
    ['a thrown connection error', new Error('connect ECONNREFUSED')],
    ['a Better Auth 500', new APIError('INTERNAL_SERVER_ERROR')],
  ])('answers 503, not 401, when the auth backend fails with %s', async (_label, failure) => {
    mockGetSession.mockRejectedValueOnce(failure);

    const response = await app.inject({
      method: 'GET',
      url,
      headers: { cookie: AUTH_COOKIE },
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('5');
    expect(response.json()).toEqual({
      error: 'SERVICE_UNAVAILABLE',
      message: m.common_generic_error({}, { locale: 'pt-BR' }),
    });
    expect(activeChurchResolver.resolve).not.toHaveBeenCalled();
  });
});

describe('OpenAPI for the session routes', () => {
  it('declares the 503 beside every 401 the active-church and redemption routes send', () => {
    const { paths = {} } = app.swagger() as {
      paths?: Record<string, Record<string, { responses: object }>>;
    };
    const sessionOperations = Object.entries(paths)
      .filter(([path]) => /^\/api\/v1\/(active-church|redemption)\//.test(path))
      .flatMap(([path, operations]) =>
        Object.entries(operations).map(([method, operation]) => ({
          route: `${method.toUpperCase()} ${path}`,
          statuses: Object.keys(operation.responses),
        })),
      )
      .filter(({ statuses }) => statuses.includes('401'));

    expect(sessionOperations).toHaveLength(10);
    for (const { route, statuses } of sessionOperations) {
      expect({ route, declares503: statuses.includes('503') }).toEqual({
        route,
        declares503: true,
      });
    }
  });
});
