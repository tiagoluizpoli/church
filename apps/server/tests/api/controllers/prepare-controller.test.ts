import { m } from '@church/i18n/messages';
import { parseInstant } from '@church/time';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PrepareController } from '@/api/controllers/prepare-controller';
import { IllegalStateTransitionError } from '@/domain/errors/illegal-state-transition';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testLocale } from '@/tests/test-support/fastify-locale';

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

const participationManager = {
  getCycleParticipation: vi.fn(),
  listScheduleSummaries: vi.fn(),
};

const availabilityCheckManager = {
  askAvailability: vi.fn(),
  listCycleCheckStatuses: vi.fn(),
  resendReminder: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

const authorityGuard = {
  canManageMinistry: vi.fn(),
  canManageParticipation: vi.fn(),
  canManageShift: vi.fn(),
  decideManageMinistry: vi.fn(),
  decideManageParticipation: vi.fn(),
  decideManageShift: vi.fn(),
  decideManageAnyMinistry: vi.fn(),
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
  app = await createFastify({ locale: testLocale });
  const controller = new PrepareController({
    participationManager: participationManager as never,
    availabilityCheckManager: availabilityCheckManager as never,
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
    user: { id: 'leader-user' },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue(
    createActiveChurchResolution(),
  );
  authorityGuard.canManageMinistry.mockResolvedValue(true);
  authorityGuard.canManageParticipation.mockResolvedValue(true);
  authorityGuard.canManageShift.mockResolvedValue(true);
  authorityGuard.decideManageMinistry.mockResolvedValue({ allowed: true });
  authorityGuard.decideManageParticipation.mockResolvedValue({ allowed: true });
  authorityGuard.decideManageShift.mockResolvedValue({ allowed: true });
  authorityGuard.decideManageAnyMinistry.mockResolvedValue({ allowed: true });
});

const MINISTRY = '55555555-5555-5555-8555-555555555555';
const CYCLE = '77777777-7777-7777-8777-777777777777';
const PARTICIPATION = '22222222-2222-2222-8222-222222222222';
const BLOCK = '33333333-3333-3333-8333-333333333333';
const SHIFT = '66666666-6666-6666-8666-666666666666';

type ScopeDecision =
  | 'decideManageMinistry'
  | 'decideManageParticipation'
  | 'decideManageShift';

interface ScopedPrepareRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  decision: ScopeDecision;
  payload?: Record<string, unknown>;
}

const scopedPrepareRoutes: ScopedPrepareRoute[] = [
  {
    method: 'GET',
    url: `/api/v1/prepare/cycles/${CYCLE}/participation?ministryId=${MINISTRY}`,
    decision: 'decideManageMinistry',
  },
  {
    method: 'GET',
    url: `/api/v1/prepare/ministries/${MINISTRY}/cycles-summary`,
    decision: 'decideManageMinistry',
  },
  {
    method: 'POST',
    url: `/api/v1/prepare/participations/${PARTICIPATION}/ask-availability`,
    decision: 'decideManageParticipation',
  },
  {
    method: 'GET',
    url: `/api/v1/prepare/cycles/${CYCLE}/availability-status?ministryId=${MINISTRY}`,
    decision: 'decideManageMinistry',
  },
  {
    method: 'GET',
    url: `/api/v1/prepare/participations/${PARTICIPATION}/availability-status`,
    decision: 'decideManageParticipation',
  },
  {
    method: 'POST',
    url: `/api/v1/prepare/participations/${PARTICIPATION}/resend-availability`,
    decision: 'decideManageParticipation',
  },
];

function expectNoPrepareWork(): void {
  for (const operation of [
    ...Object.values(participationManager),
    ...Object.values(availabilityCheckManager),
  ]) {
    expect(operation).not.toHaveBeenCalled();
  }
}

const retiredPrepareRoutes: ScopedPrepareRoute[] = [
  {
    method: 'PUT',
    url: `/api/v1/prepare/participations/${PARTICIPATION}/inclusions`,
    decision: 'decideManageParticipation',
    payload: { eventTimeBlockIds: [] },
  },
  {
    method: 'POST',
    url: `/api/v1/prepare/participations/${PARTICIPATION}/event-time-blocks/${BLOCK}/shifts`,
    decision: 'decideManageParticipation',
    payload: { strategy: { kind: 'equal-n', n: 2 } },
  },
  {
    method: 'PATCH',
    url: `/api/v1/prepare/shifts/${SHIFT}`,
    decision: 'decideManageShift',
    payload: { label: 'Renamed' },
  },
  {
    method: 'DELETE',
    url: `/api/v1/prepare/shifts/${SHIFT}`,
    decision: 'decideManageShift',
  },
  {
    method: 'PUT',
    url: `/api/v1/prepare/shifts/${SHIFT}/requirements`,
    decision: 'decideManageShift',
    payload: { sectorId: 'sector-1', roleId: 'role-1', peopleNeeded: 1 },
  },
];

describe('Retired Prepare writes', () => {
  it('omits the retired paths from OpenAPI', () => {
    const { paths } = app.swagger();
    expect(paths).toBeDefined();
    for (const route of retiredPrepareRoutes) {
      const path = route.url
        .replace(PARTICIPATION, '{participationId}')
        .replace(BLOCK, '{eventTimeBlockId}')
        .replace(SHIFT, '{shiftId}');
      expect(paths?.[path]).toBeUndefined();
    }
  });

  it.each(retiredPrepareRoutes)('$method $url is unregistered', async ({
    method,
    url,
    payload,
  }) => {
    const response = await app.inject({ method, url, payload });

    expect(response.statusCode).toBe(404);
    expectNoPrepareWork();
  });
});

describe('Prepare route refusals', () => {
  it.each(
    scopedPrepareRoutes,
  )('$method $url: missing and hidden objects share one 404', async ({
    method,
    url,
    decision,
    payload,
  }) => {
    authorityGuard[decision].mockResolvedValueOnce({
      allowed: false,
      reason: 'RESOURCE_NOT_FOUND',
    });
    const missing = await app.inject({ method, url, payload });
    authorityGuard[decision].mockResolvedValueOnce({
      allowed: false,
      reason: 'INSUFFICIENT_ACCESS_LEVEL',
    });
    const hidden = await app.inject({ method, url, payload });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: 'NOT_FOUND',
      message: m.error_not_found(),
    });
    expect(hidden).toMatchObject({ statusCode: 404, body: missing.body });
    expectNoPrepareWork();
  });

  it.each(
    scopedPrepareRoutes,
  )('$method $url: 403 without the scheduling function', async ({
    method,
    url,
    decision,
    payload,
  }) => {
    authorityGuard[decision].mockResolvedValue({
      allowed: false,
      reason: 'INSUFFICIENT_ACCESS_LEVEL',
    });
    authorityGuard.decideManageAnyMinistry.mockResolvedValue({
      allowed: false,
      reason: 'INSUFFICIENT_ACCESS_LEVEL',
    });

    const response = await app.inject({ method, url, payload });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('FORBIDDEN');
    expectNoPrepareWork();
  });
});

describe('Prepare participation routes', () => {
  it('documents the generic 404 refusal for every scope-protected route', () => {
    const document = app.swagger();
    if (!document.paths) {
      throw new Error('OpenAPI document must declare paths');
    }
    const { paths } = document;
    const scopeProtectedOperations = [
      paths['/api/v1/prepare/cycles/{cycleId}/participation']?.get,
      paths['/api/v1/prepare/ministries/{ministryId}/cycles-summary']?.get,
      paths['/api/v1/prepare/participations/{participationId}/ask-availability']
        ?.post,
      paths['/api/v1/prepare/cycles/{cycleId}/availability-status']?.get,
      paths[
        '/api/v1/prepare/participations/{participationId}/availability-status'
      ]?.get,
      paths[
        '/api/v1/prepare/participations/{participationId}/resend-availability'
      ]?.post,
    ];

    for (const operation of scopeProtectedOperations) {
      expect(operation?.responses?.['404']).toBeDefined();
    }
  });

  it('returns the same generic 404 for a missing or inaccessible participation after admission', async () => {
    authorityGuard.decideManageParticipation.mockResolvedValueOnce({
      allowed: false,
      reason: 'RESOURCE_NOT_FOUND',
    });
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/prepare/participations/22222222-2222-2222-8222-222222222222/ask-availability',
    });

    authorityGuard.decideManageParticipation.mockResolvedValueOnce({
      allowed: false,
      reason: 'INSUFFICIENT_ACCESS_LEVEL',
    });
    const hidden = await app.inject({
      method: 'POST',
      url: '/api/v1/prepare/participations/22222222-2222-2222-8222-222222222222/ask-availability',
    });

    expect(missing.statusCode).toBe(404);
    expect(hidden).toMatchObject({ statusCode: 404, body: missing.body });
    expect(availabilityCheckManager.askAvailability).not.toHaveBeenCalled();
  });
  it('returns 401 for any route when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/prepare/participations/22222222-2222-2222-8222-222222222222/ask-availability',
    });

    expect(response.statusCode).toBe(401);
    expect(availabilityCheckManager.askAvailability).not.toHaveBeenCalled();
  });

  it('POST /api/v1/prepare/participations/:id/ask-availability returns 202', async () => {
    availabilityCheckManager.askAvailability.mockResolvedValue({
      createdCheckCount: 4,
      notifiedVolunteerCount: 4,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/prepare/participations/22222222-2222-2222-8222-222222222222/ask-availability',
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      createdCheckCount: 4,
      notifiedVolunteerCount: 4,
    });
  });

  it('keeps the per-participation reminder callable', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/prepare/participations/${PARTICIPATION}/resend-availability`,
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ resent: true });
  });

  it('POST /api/v1/prepare/participations/:id/ask-availability returns 409 for wrong state', async () => {
    availabilityCheckManager.askAvailability.mockRejectedValue(
      new IllegalStateTransitionError({
        from: 'availability_requested',
        to: 'ask',
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/prepare/participations/22222222-2222-2222-8222-222222222222/ask-availability',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'ILLEGAL_STATE_TRANSITION',
      message: m.error_illegal_state_transition(),
    });
  });

  it('GET /api/v1/prepare/cycles/:id/availability-status returns 200', async () => {
    availabilityCheckManager.listCycleCheckStatuses.mockResolvedValue([
      {
        volunteerId: 'vol-1',
        volunteerName: 'E2E Volunteer',
        state: 'confirmed',
        confirmedAt: parseInstant({ value: '2026-08-03T10:00:00.000Z' }),
      },
      {
        volunteerId: 'vol-2',
        volunteerName: 'Grace Hopper',
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/prepare/cycles/11111111-1111-1111-8111-111111111111/availability-status?ministryId=22222222-2222-2222-8222-222222222222',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      statuses: [
        {
          volunteerId: 'vol-1',
          volunteerName: 'E2E Volunteer',
          state: 'confirmed',
          confirmedAt: '2026-08-03T10:00:00.000Z',
        },
        {
          volunteerId: 'vol-2',
          volunteerName: 'Grace Hopper',
        },
      ],
    });
  });

  it('GET /api/v1/prepare/ministries/:ministryId/cycles-summary returns 200 matching the DTO schema', async () => {
    participationManager.listScheduleSummaries.mockResolvedValue([
      {
        cycleId: '11111111-1111-1111-8111-111111111111',
        name: 'August',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-31T00:00:00.000Z'),
        isPartOf: true,
        eventCount: 2,
        eventTimeBlockCount: 3,
        status: 'in_progress',
        availabilityRequestedForAll: false,
        availabilityRequestedForAny: false,
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/prepare/ministries/22222222-2222-2222-8222-222222222222/cycles-summary',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      cycles: [
        {
          cycleId: '11111111-1111-1111-8111-111111111111',
          name: 'August',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          isPartOf: true,
          eventCount: 2,
          eventTimeBlockCount: 3,
          status: 'in_progress',
          availabilityRequestedForAll: false,
          availabilityRequestedForAny: false,
        },
      ],
    });
    expect(participationManager.listScheduleSummaries).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId: '22222222-2222-2222-8222-222222222222',
    });
  });

  it('GET /api/v1/prepare/ministries/:ministryId/cycles-summary returns 403 for a non-leader of the ministry', async () => {
    authorityGuard.decideManageMinistry.mockResolvedValue(false);
    authorityGuard.decideManageAnyMinistry.mockResolvedValue(false);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/prepare/ministries/22222222-2222-2222-8222-222222222222/cycles-summary',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'FORBIDDEN',
      message: m.error_forbidden(),
    });
    expect(participationManager.listScheduleSummaries).not.toHaveBeenCalled();
  });
});
