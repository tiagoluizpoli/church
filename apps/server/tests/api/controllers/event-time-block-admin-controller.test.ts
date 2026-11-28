import { NotFoundError } from '@church/core';
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
import { EventTimeBlockAdminController } from '@/api/controllers/event-time-block-admin-controller';
import { IllegalStateTransitionError } from '@/domain/errors/illegal-state-transition';
import { LastRemainingEventTimeBlockError } from '@/domain/errors/last-remaining-event-time-block-error';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
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

const planningEventManager = {
  generateFromTemplates: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  previewCancellation: vi.fn(),
  confirmCancellation: vi.fn(),
  createEventTimeBlock: vi.fn(),
  updateEventTimeBlock: vi.fn(),
  deleteEventTimeBlock: vi.fn(),
  setHidden: vi.fn(),
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
  const controller = new EventTimeBlockAdminController({
    planningEventManager: planningEventManager as never,
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
  it('POST .../event-time-blocks: creates an event time block and returns 201, and returns 409 for a sent cycle', async () => {
    const cycleId = '22222222-2222-2222-2222-222222222222';
    const eventId = '66666666-6666-6666-6666-666666666666';
    const eventTimeBlocksUrl = `/api/v1/admin/cycles/${cycleId}/events/${eventId}/event-time-blocks`;

    planningEventManager.createEventTimeBlock.mockResolvedValue({
      id: '99999999-9999-9999-9999-999999999999',
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId,
      startTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
      endTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
      isPublic: false,
      label: 'Worship',
      status: 'active',
      requirements: [],
    });

    const success = await app.inject({
      method: 'POST',
      url: eventTimeBlocksUrl,
      payload: {
        startTime: '2026-08-02T09:00:00.000Z',
        endTime: '2026-08-02T10:00:00.000Z',
        label: 'Worship',
      },
    });
    expect(success.statusCode).toBe(201);
    expect(success.json()).toMatchObject({ label: 'Worship' });

    planningEventManager.createEventTimeBlock.mockRejectedValueOnce(
      new IllegalStateTransitionError({ from: 'scheduled', to: 'update' }),
    );
    const locked = await app.inject({
      method: 'POST',
      url: eventTimeBlocksUrl,
      payload: {
        startTime: '2026-08-02T09:00:00.000Z',
        endTime: '2026-08-02T10:00:00.000Z',
      },
    });
    expect(locked.statusCode).toBe(409);
  });

  it('PATCH/DELETE .../event-time-blocks/:eventTimeBlockId: happy paths, 404, 409 locked, 409 last remaining event time block', async () => {
    const cycleId = '22222222-2222-2222-2222-222222222222';
    const eventId = '66666666-6666-6666-6666-666666666666';
    const eventTimeBlockId = '99999999-9999-9999-9999-999999999999';
    const eventTimeBlockUrl = `/api/v1/admin/cycles/${cycleId}/events/${eventId}/event-time-blocks/${eventTimeBlockId}`;

    planningEventManager.updateEventTimeBlock.mockResolvedValue({
      id: eventTimeBlockId,
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId,
      startTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
      endTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
      isPublic: false,
      label: 'Worship',
      status: 'active',
      requirements: [],
    });

    const updateOk = await app.inject({
      method: 'PATCH',
      url: eventTimeBlockUrl,
      payload: { label: 'Worship' },
    });
    expect(updateOk.statusCode).toBe(200);
    expect(updateOk.json()).toMatchObject({
      id: eventTimeBlockId,
      label: 'Worship',
    });

    planningEventManager.deleteEventTimeBlock.mockResolvedValue(undefined);
    const deleteOk = await app.inject({
      method: 'DELETE',
      url: eventTimeBlockUrl,
    });
    expect(deleteOk.statusCode).toBe(204);

    planningEventManager.updateEventTimeBlock.mockRejectedValueOnce(
      new NotFoundError(`EventTimeBlock not found: ${eventTimeBlockId}`),
    );
    const notFound = await app.inject({
      method: 'PATCH',
      url: eventTimeBlockUrl,
      payload: { label: 'Mismatched' },
    });
    expect(notFound.statusCode).toBe(404);

    planningEventManager.updateEventTimeBlock.mockRejectedValueOnce(
      new IllegalStateTransitionError({ from: 'scheduled', to: 'update' }),
    );
    const locked = await app.inject({
      method: 'PATCH',
      url: eventTimeBlockUrl,
      payload: { label: 'Too late' },
    });
    expect(locked.statusCode).toBe(409);

    planningEventManager.deleteEventTimeBlock.mockRejectedValueOnce(
      new LastRemainingEventTimeBlockError(),
    );
    const lastEventTimeBlock = await app.inject({
      method: 'DELETE',
      url: eventTimeBlockUrl,
    });
    expect(lastEventTimeBlock.statusCode).toBe(409);
  });

  it('returns the same 404 for missing and cross-parent nested EventTimeBlocks', async () => {
    const cycleId = '22222222-2222-2222-2222-222222222222';
    const eventId = '66666666-6666-6666-6666-666666666666';
    const missingTimeBlockId = '99999999-9999-9999-9999-999999999998';
    const hiddenTimeBlockId = '99999999-9999-9999-9999-999999999997';
    planningEventManager.updateEventTimeBlock.mockRejectedValueOnce(
      new NotFoundError(`EventTimeBlock not found: ${missingTimeBlockId}`),
    );
    const missing = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/cycles/${cycleId}/events/${eventId}/event-time-blocks/${missingTimeBlockId}`,
      payload: { label: 'Missing' },
    });

    planningEventManager.updateEventTimeBlock.mockRejectedValueOnce(
      new NotFoundError(`EventTimeBlock not found: ${hiddenTimeBlockId}`),
    );
    const crossParent = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/cycles/${cycleId}/events/${eventId}/event-time-blocks/${hiddenTimeBlockId}`,
      payload: { label: 'Foreign' },
    });

    expect(missing.statusCode).toBe(404);
    expect(crossParent.statusCode).toBe(404);
    expect(crossParent.json()).toEqual(missing.json());
    expect(planningEventManager.updateEventTimeBlock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        churchId: '11111111-1111-1111-1111-111111111111',
        cycleId,
        eventId,
        eventTimeBlockId: hiddenTimeBlockId,
      }),
    );
  });
});

describe('Church admin request input and empty replies (#1222)', () => {
  const cycleUrl = '/api/v1/admin/cycles/22222222-2222-2222-2222-222222222222';
  const eventUrl = `${cycleUrl}/events/66666666-6666-6666-6666-666666666666`;
  const blockUrl = `${eventUrl}/event-time-blocks/99999999-9999-9999-9999-999999999999`;

  it.each([
    ['delete an EventTimeBlock', 'DELETE', blockUrl, undefined],
  ] as const)('%s answers 204 with an empty body', async (_case, method, url, payload) => {
    const response = await app.inject({ method, url, payload });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(response.headers['content-type']).toBeUndefined();
    expect(response.headers['content-length']).toBeUndefined();
  });
});
