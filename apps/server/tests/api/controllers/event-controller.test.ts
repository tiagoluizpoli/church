import { NotFoundError } from '@church/core';
import { m } from '@church/i18n/messages';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { EventController } from '@/api/controllers/event-controller';
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

const eventManager = {
  getScheduleBuilderData: vi.fn(),
  listEvents: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

const authorityGuard = {
  decideManageAnyMinistry: vi.fn(),
  decideManageMinistry: vi.fn(),
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
  const controller = new EventController({
    eventManager: eventManager as never,
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
    user: { id: 'admin-leader-user' },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue(
    createActiveChurchResolution(),
  );
  authorityGuard.decideManageAnyMinistry.mockResolvedValue({ allowed: true });
  authorityGuard.decideManageMinistry.mockResolvedValue({ allowed: true });
});

describe('Event controller authorization wiring', () => {
  it('returns 401 for any route when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events?ministryId=22222222-2222-2222-8222-222222222222',
    });

    expect(response.statusCode).toBe(401);
    expect(eventManager.listEvents).not.toHaveBeenCalled();
  });

  it('GET /api/v1/events/schedule-builder allows a ChurchAdmin without a Volunteer profile and passes User identity', async () => {
    activeChurchResolver.resolve.mockResolvedValue({
      ...createActiveChurchResolution(),
      volunteerId: null,
    });
    eventManager.getScheduleBuilderData.mockResolvedValue({
      events: [],
      assignments: [],
      unavailableShifts: [],
      volunteers: [],
      roles: [],
      sectors: [],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events/schedule-builder?eventId=66666666-6666-6666-6666-666666666666',
    });

    expect(response.statusCode).toBe(200);
    expect(eventManager.getScheduleBuilderData).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId: '66666666-6666-6666-6666-666666666666',
      userId: 'admin-leader-user',
      ministryId: undefined,
    });
  });

  it("GET /api/v1/events/schedule-builder returns the Ministry's Sectors", async () => {
    const sectors = [
      { id: '77777777-7777-4777-8777-777777777771', name: 'Kids' },
      { id: '77777777-7777-4777-8777-777777777772', name: 'Maternal' },
    ];
    eventManager.getScheduleBuilderData.mockResolvedValue({
      events: [],
      assignments: [],
      unavailableShifts: [],
      volunteers: [],
      roles: [],
      sectors,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events/schedule-builder?eventId=66666666-6666-6666-6666-666666666666',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sectors).toEqual(sectors);
  });

  it('GET /api/v1/events/schedule-builder returns 403 before object lookup when the caller lacks the scheduling function', async () => {
    authorityGuard.decideManageAnyMinistry.mockResolvedValue({
      allowed: false,
      reason: 'INSUFFICIENT_ACCESS_LEVEL',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events/schedule-builder?eventId=66666666-6666-6666-6666-666666666666',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'FORBIDDEN',
      message: m.error_forbidden(),
    });
    expect(eventManager.getScheduleBuilderData).not.toHaveBeenCalled();
  });

  it('GET /api/v1/events/schedule-builder returns a generic 404 for missing or hidden objects', async () => {
    eventManager.getScheduleBuilderData.mockRejectedValue(
      new NotFoundError('hidden ministry'),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events/schedule-builder?eventId=66666666-6666-6666-6666-666666666666&ministryId=99999999-9999-4999-8999-999999999999',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NOT_FOUND',
      message: m.error_not_found(),
    });
  });

  it('GET /api/v1/events admits a ChurchAdmin, then evaluates the requested Ministry object', async () => {
    eventManager.listEvents.mockResolvedValue([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events?ministryId=22222222-2222-2222-8222-222222222222',
    });

    expect(response.statusCode).toBe(200);
    expect(authorityGuard.decideManageAnyMinistry).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      userId: 'admin-leader-user',
    });
    expect(authorityGuard.decideManageMinistry).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId: '22222222-2222-2222-8222-222222222222',
      userId: 'admin-leader-user',
    });
  });

  it('GET /api/v1/events returns 403 for a caller without the scheduling function', async () => {
    authorityGuard.decideManageAnyMinistry.mockResolvedValue({
      allowed: false,
      reason: 'INSUFFICIENT_ACCESS_LEVEL',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events?ministryId=22222222-2222-2222-8222-222222222222',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'FORBIDDEN',
      message: m.error_forbidden(),
    });
    expect(eventManager.listEvents).not.toHaveBeenCalled();
  });

  it('GET /api/v1/events returns an indistinguishable 404 for a missing or hidden Ministry', async () => {
    authorityGuard.decideManageMinistry.mockResolvedValue({
      allowed: false,
      reason: 'OUTSIDE_SCOPE',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events?ministryId=99999999-9999-4999-8999-999999999999',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NOT_FOUND',
      message: m.error_not_found(),
    });
    expect(eventManager.listEvents).not.toHaveBeenCalled();
  });

  it('a ChurchAdmin with no Volunteer profile remains valid for Ministry Event reads', async () => {
    activeChurchResolver.resolve.mockResolvedValue({
      ...createActiveChurchResolution(),
      volunteerId: null,
    });
    eventManager.listEvents.mockResolvedValue([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events?ministryId=22222222-2222-2222-8222-222222222222',
    });

    expect(response.statusCode).toBe(200);
  });
});
