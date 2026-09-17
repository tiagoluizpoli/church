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
import { createFastify } from '../../main/fastify/setup';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { TimeSlotController } from './time-slot-controller';

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
  createSlot: vi.fn(),
  updateSlot: vi.fn(),
  deleteSlot: vi.fn(),
  generateSlots: vi.fn(),
  upsertSlotRequirement: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

const authorityGuard = {
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
  const controller = new TimeSlotController(
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
  authorityGuard.canManageEvent.mockResolvedValue(true);
});

const eventId = '66666666-6666-6666-6666-666666666666';

describe('TimeSlot controller authorization wiring', () => {
  it('returns 401 for any route when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/slots`,
      payload: {
        startTime: '2026-08-02T09:00:00.000Z',
        endTime: '2026-08-02T10:00:00.000Z',
        label: 'Worship',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(eventManager.createSlot).not.toHaveBeenCalled();
  });

  it('POST /api/v1/events/:eventId/slots authorizes via AuthorityGuard.canManageEvent', async () => {
    eventManager.createSlot.mockResolvedValue({
      id: '99999999-9999-9999-9999-999999999999',
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId,
      startTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
      endTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
      label: 'Worship',
      status: 'active',
      requirements: [],
    });

    const allowed = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/slots`,
      payload: {
        startTime: '2026-08-02T09:00:00.000Z',
        endTime: '2026-08-02T10:00:00.000Z',
        label: 'Worship',
      },
    });
    expect(allowed.statusCode).toBe(201);
    expect(authorityGuard.canManageEvent).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId,
      userId: 'admin-leader-user',
    });

    authorityGuard.canManageEvent.mockResolvedValueOnce(false);
    const denied = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/slots`,
      payload: {
        startTime: '2026-08-02T09:00:00.000Z',
        endTime: '2026-08-02T10:00:00.000Z',
        label: 'Worship',
      },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Not a leader of this event',
    });
    expect(eventManager.createSlot).toHaveBeenCalledTimes(1);
  });

  it('DELETE /api/v1/events/:eventId/slots/:slotId authorizes via AuthorityGuard.canManageEvent', async () => {
    const slotId = '99999999-9999-9999-9999-999999999999';

    authorityGuard.canManageEvent.mockResolvedValueOnce(false);
    const denied = await app.inject({
      method: 'DELETE',
      url: `/api/v1/events/${eventId}/slots/${slotId}`,
    });
    expect(denied.statusCode).toBe(403);
    expect(eventManager.deleteSlot).not.toHaveBeenCalled();

    const allowed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/events/${eventId}/slots/${slotId}`,
    });
    expect(allowed.statusCode).toBe(204);
    expect(eventManager.deleteSlot).toHaveBeenCalledTimes(1);
  });
});
