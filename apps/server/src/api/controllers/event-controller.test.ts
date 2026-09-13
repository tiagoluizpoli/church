import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createFastify } from '../../main/fastify/setup';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { EventController } from './event-controller';

vi.mock('@church/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

const mockGetSession = vi.mocked(
  (await import('@church/auth')).auth.api.getSession,
);

const eventManager = {
  getScheduleBuilderData: vi.fn(),
  listEvents: vi.fn(),
  cancelEvent: vi.fn(),
  sendReminder: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

const authorityGuard = {
  canManageMinistry: vi.fn(),
  canManageEvent: vi.fn(),
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
  app = await createFastify();
  const controller = new EventController(
    eventManager as never,
    activeChurchResolver as never,
    authorityGuard as never,
  );
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
  authorityGuard.canManageMinistry.mockResolvedValue(true);
  authorityGuard.canManageEvent.mockResolvedValue(true);
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

  it('GET /api/v1/events/schedule-builder stays reachable by any authenticated volunteer (no coarse role gate)', async () => {
    eventManager.getScheduleBuilderData.mockResolvedValue({
      events: [],
      assignments: [],
      availability: [],
      volunteers: [],
      roles: [],
      callerTeamIds: null,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events/schedule-builder?eventId=66666666-6666-6666-6666-666666666666',
    });

    expect(response.statusCode).toBe(200);
  });

  it('GET /api/v1/events/schedule-builder 401s when the caller has no Volunteer profile at all', async () => {
    activeChurchResolver.resolve.mockResolvedValue({
      ...createActiveChurchResolution(),
      volunteerId: null,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events/schedule-builder?eventId=66666666-6666-6666-6666-666666666666',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'UNAUTHORIZED',
      message: 'Volunteer profile not found',
    });
    expect(eventManager.getScheduleBuilderData).not.toHaveBeenCalled();
  });

  it('GET /api/v1/events allows a Ministry leader and denies a non-leader', async () => {
    eventManager.listEvents.mockResolvedValue([]);

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/v1/events?ministryId=22222222-2222-2222-8222-222222222222',
    });
    expect(allowed.statusCode).toBe(200);
    expect(authorityGuard.canManageMinistry).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId: '22222222-2222-2222-8222-222222222222',
      userId: 'admin-leader-user',
    });

    authorityGuard.canManageMinistry.mockResolvedValueOnce(false);
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/events?ministryId=22222222-2222-2222-8222-222222222222',
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Not a leader of this ministry',
    });
  });

  it('a ChurchAdmin with no Volunteer profile is still a valid caller for pure Church-authority routes', async () => {
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

  it('POST /api/v1/events/:eventId/cancel authorizes via AuthorityGuard.canManageEvent', async () => {
    const eventId = '66666666-6666-6666-6666-666666666666';

    const allowed = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/cancel`,
    });
    expect(allowed.statusCode).toBe(201);
    expect(eventManager.cancelEvent).toHaveBeenCalledTimes(1);
    expect(authorityGuard.canManageEvent).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId,
      userId: 'admin-leader-user',
    });

    authorityGuard.canManageEvent.mockResolvedValueOnce(false);
    const denied = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/cancel`,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Not a leader of this event',
    });
    expect(eventManager.cancelEvent).toHaveBeenCalledTimes(1);
  });
});
