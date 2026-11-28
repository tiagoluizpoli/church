import { parseCalendarDay } from '@church/time';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CycleAdminController } from '@/api/controllers/cycle-admin-controller';
import { IllegalStateTransitionError } from '@/domain/errors/illegal-state-transition';
import { OverlappingCycleError } from '@/domain/errors/overlapping-cycle';
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

const cycleManager = {
  createCycle: vi.fn(),
  listCycles: vi.fn(),
  getCycle: vi.fn(),
  sendCycle: vi.fn(),
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

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const controller = new CycleAdminController({
    sessionGateway: testSessionGateway(),
    cycleManager: cycleManager as never,
    setupProgressManager: {} as never,
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
  it('returns 401 for any route when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/cycles',
    });

    expect(response.statusCode).toBe(401);
    expect(cycleManager.listCycles).not.toHaveBeenCalled();
  });

  it('POST /api/v1/admin/cycles returns 201 and 409 for overlap conflicts', async () => {
    cycleManager.createCycle.mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      churchId: '11111111-1111-1111-1111-111111111111',
      name: 'August 2026',
      startDate: parseCalendarDay({ value: '2026-08-01' }),
      endDate: parseCalendarDay({ value: '2026-09-01' }),
      state: 'draft',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    const success = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/cycles',
      payload: {
        name: 'August 2026',
        startDate: '2026-08-01',
        endDate: '2026-09-01',
      },
    });

    expect(success.statusCode).toBe(201);

    cycleManager.createCycle.mockRejectedValueOnce(
      new OverlappingCycleError({ conflictingCycles: [] }),
    );
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/cycles',
      payload: {
        name: 'Overlap',
        startDate: '2026-08-15',
        endDate: '2026-09-15',
      },
    });

    expect(conflict.statusCode).toBe(409);
  });

  it('POST /api/v1/admin/cycles/:id/send returns 204 and 403 for non-admin users', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/cycles/22222222-2222-2222-2222-222222222222/send',
    });

    expect(ok.statusCode).toBe(204);

    authorityGuard.canManageChurch.mockResolvedValueOnce(false);

    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/cycles/22222222-2222-2222-2222-222222222222/send',
    });

    expect(forbidden.statusCode).toBe(403);

    cycleManager.sendCycle.mockRejectedValueOnce(
      new IllegalStateTransitionError({ from: 'sent', to: 'sent' }),
    );
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/cycles/22222222-2222-2222-2222-222222222222/send',
    });

    expect(conflict.statusCode).toBe(409);
  });
});

describe('Church admin request input and empty replies (#1222)', () => {
  const cycleUrl = '/api/v1/admin/cycles/22222222-2222-2222-2222-222222222222';

  it('GET /admin/cycles passes the parsed query filters to the manager', async () => {
    cycleManager.listCycles.mockResolvedValue({
      cycles: [],
      counts: { draft: 0, sent: 0, past: 0 },
      eventCounts: {},
      pastMatching: 0,
      currentCycleId: null,
      next: { startDate: '2026-11-01', endDate: '2026-11-30', isDue: false },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/cycles?state=draft&period=past&search=%20Outubro%20&from=2026-10-01&to=2026-10-31',
    });

    expect(response.statusCode).toBe(200);
    expect(cycleManager.listCycles).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      state: 'draft',
      period: 'past',
      search: 'Outubro',
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-10-31T00:00:00.000Z'),
    });
  });

  it('GET /admin/cycles refuses an unknown state with 422 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/cycles?state=archived',
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    expect(cycleManager.listCycles).not.toHaveBeenCalled();
  });

  it.each([
    ['send a Cycle', 'POST', `${cycleUrl}/send`, undefined],
  ] as const)('%s answers 204 with an empty body', async (_case, method, url, payload) => {
    const response = await app.inject({ method, url, payload });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(response.headers['content-type']).toBeUndefined();
    expect(response.headers['content-length']).toBeUndefined();
  });
});
