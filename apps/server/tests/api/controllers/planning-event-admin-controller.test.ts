import { parseCalendarDay, parseInstant } from '@church/time';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PlanningEventAdminController } from '@/api/controllers/planning-event-admin-controller';
import { Event } from '@/domain/entities/event';
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
  const controller = new PlanningEventAdminController({
    sessionGateway: testSessionGateway(),
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
  it('POST /api/v1/admin/cycles/:id/apply-templates returns 201 and 422 for invalid bodies', async () => {
    planningEventManager.generateFromTemplates.mockResolvedValue({
      generatedEventCount: 5,
      generatedEventTimeBlockCount: 9,
      leftoverEventTimeBlocks: [],
    });

    const success = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/cycles/22222222-2222-2222-2222-222222222222/apply-templates',
      payload: {
        templateIds: ['33333333-3333-3333-3333-333333333333'],
      },
    });

    expect(success.statusCode).toBe(201);
    expect(success.json()).toEqual({
      generatedEventCount: 5,
      generatedEventTimeBlockCount: 9,
      leftoverEventTimeBlocks: [],
    });

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/cycles/22222222-2222-2222-2222-222222222222/apply-templates',
      payload: {
        templateIds: [],
      },
    });

    expect(invalid.statusCode).toBe(422);
  });

  it('POST /api/v1/admin/cycles/:id/events stores the client-computed church-local Instants as given (#149)', async () => {
    // The Event editor sends already church-local bounds; the controller no
    // longer reinterprets them (no datesRepresentChurchCalendarDays flag).
    // The church-timezone day-placement proof itself (a real church, a real
    // DB) lives at the manager layer in
    // tests/application/planning-phase3.managers.test.ts — this test's job
    // is only to confirm the HTTP layer doesn't reintroduce reinterpretation
    // between the wire and the manager call.
    planningEventManager.createEvent.mockResolvedValue({
      eventTimeBlocks: [],
      event: new Event({
        props: {
          churchId: '11111111-1111-1111-1111-111111111111',
          cycleId: '22222222-2222-2222-2222-222222222222',
          title: 'Domingo',
          start: parseInstant({ value: '2026-06-28T03:00:00.000Z' }),
          end: parseInstant({ value: '2026-06-29T02:59:59.999Z' }),
        },
        id: '33333333-3333-3333-3333-333333333333',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/cycles/22222222-2222-2222-2222-222222222222/events',
      payload: {
        title: 'Domingo',
        start: '2026-06-28T03:00:00.000Z',
        end: '2026-06-29T02:59:59.999Z',
        eventTimeBlocks: [
          {
            label: 'Domingo',
            startTime: '2026-06-28T03:00:00.000Z',
            endTime: '2026-06-29T02:59:59.999Z',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(planningEventManager.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        start: new Date('2026-06-28T03:00:00.000Z'),
        end: new Date('2026-06-29T02:59:59.999Z'),
        eventTimeBlocks: [
          {
            label: 'Domingo',
            startTime: new Date('2026-06-28T03:00:00.000Z'),
            endTime: new Date('2026-06-29T02:59:59.999Z'),
          },
        ],
      }),
    );
    expect(planningEventManager.createEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        datesRepresentChurchCalendarDays: expect.anything(),
      }),
    );
  });
});

describe('Church admin request input and empty replies (#1222)', () => {
  const cycleUrl = '/api/v1/admin/cycles/22222222-2222-2222-2222-222222222222';
  const eventUrl = `${cycleUrl}/events/66666666-6666-6666-6666-666666666666`;
  const blockUrl = `${eventUrl}/event-time-blocks/99999999-9999-9999-9999-999999999999`;

  it('POST .../apply-templates answers the leftover blocks without their day, source or empty label', async () => {
    planningEventManager.generateFromTemplates.mockResolvedValue({
      generatedEventCount: 1,
      generatedEventTimeBlockCount: 2,
      leftoverEventTimeBlocks: [
        {
          eventId: '66666666-6666-6666-6666-666666666666',
          eventTitle: 'Culto',
          eventDate: parseCalendarDay({ value: '2026-08-02' }),
          eventTimeBlockId: '99999999-9999-9999-9999-999999999999',
          startTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
          endTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
          sourceTemplateTimeBlockId: '77777777-7777-7777-7777-777777777777',
          loserTemplateName: 'Domingo',
          winnerTemplateName: 'Natal',
        },
      ],
    });

    const response = await app.inject({
      method: 'POST',
      url: `${cycleUrl}/apply-templates`,
      payload: { templateIds: ['33333333-3333-3333-3333-333333333333'] },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      generatedEventCount: 1,
      generatedEventTimeBlockCount: 2,
      leftoverEventTimeBlocks: [
        {
          eventId: '66666666-6666-6666-6666-666666666666',
          eventTitle: 'Culto',
          eventTimeBlockId: '99999999-9999-9999-9999-999999999999',
          label: null,
          startTime: '2026-08-02T09:00:00.000Z',
          endTime: '2026-08-02T10:00:00.000Z',
          loserTemplateName: 'Domingo',
          winnerTemplateName: 'Natal',
        },
      ],
    });
  });

  it.each([
    ['delete an Event', 'DELETE', eventUrl, undefined],
    ['hide an Event', 'PUT', `${eventUrl}/hidden`, { hidden: true }],
    ['hide an EventTimeBlock', 'PUT', `${blockUrl}/hidden`, { hidden: true }],
  ] as const)('%s answers 204 with an empty body', async (_case, method, url, payload) => {
    const response = await app.inject({ method, url, payload });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(response.headers['content-type']).toBeUndefined();
    expect(response.headers['content-length']).toBeUndefined();
  });
});
