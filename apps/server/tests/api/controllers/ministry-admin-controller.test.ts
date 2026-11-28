import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { MinistryAdminController } from '@/api/controllers/ministry-admin-controller';
import { Ministry } from '@/domain/entities/ministry';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { testSessionGateway } from '@/tests/test-support/session-gateway';

vi.mock('@/main/di/server-auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const ministryManager = {
  setDefaultDirection: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

const authorityGuard = {
  canManageChurch: vi.fn(),
};

let app: FastifyTypedInstance;

function createActiveChurchResolution() {
  return {
    status: 'resolved' as const,
    churchId: '11111111-1111-1111-1111-111111111111',
    volunteerId: '44444444-4444-4444-8444-444444444444',
    autoSelected: false,
  };
}

function createMinistry(defaultDirection: 'all_in' | 'all_out'): Ministry {
  return new Ministry({
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      name: 'Projection',
      defaultDirection,
    },
    id: '33333333-3333-3333-3333-333333333333',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  });
}
beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const controller = new MinistryAdminController({
    sessionGateway: testSessionGateway(),
    ministryManager: ministryManager as never,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: authorityGuard as never,
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

beforeEach(() => {
  vi.resetAllMocks();
  mockGetSession.mockResolvedValue({
    user: { id: 'sched-admin-user' },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue(
    createActiveChurchResolution(),
  );
  authorityGuard.canManageChurch.mockResolvedValue(true);
});

describe('Church admin planning routes', () => {
  it('returns the updated default direction', async () => {
    ministryManager.setDefaultDirection.mockResolvedValue(
      createMinistry('all_in'),
    );

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/ministries/33333333-3333-3333-3333-333333333333/default-direction',
      payload: { defaultDirection: 'all_in' },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toMatchObject({
      id: '33333333-3333-3333-3333-333333333333',
      defaultDirection: 'all_in',
    });
  });
});
