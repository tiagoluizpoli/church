import { NotFoundError } from '@church/core';
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
import { ChurchAdminController } from '@/api/controllers/church-admin-controller';
import { RoleId } from '@/domain/branded-ids';
import { Event } from '@/domain/entities/event';
import { Ministry } from '@/domain/entities/ministry';
import { UsualSetup } from '@/domain/entities/usual-setup';
import { IllegalStateTransitionError } from '@/domain/errors/illegal-state-transition';
import { LastRemainingEventTimeBlockError } from '@/domain/errors/last-remaining-event-time-block-error';
import { OverlappingCycleError } from '@/domain/errors/overlapping-cycle';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';

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

const cycleManager = {
  createCycle: vi.fn(),
  listCycles: vi.fn(),
  getCycle: vi.fn(),
  sendCycle: vi.fn(),
  reopenEvent: vi.fn(),
};

const templateManager = {
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  listTemplates: vi.fn(),
};

const planningEventManager = {
  generateFromTemplates: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  createEventTimeBlock: vi.fn(),
  updateEventTimeBlock: vi.fn(),
  deleteEventTimeBlock: vi.fn(),
};

const participationManager = {
  getUsualSetup: vi.fn(),
  upsertUsualSetup: vi.fn(),
};

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

function createUsualSetup(): UsualSetup {
  return new UsualSetup({
    id: '55555555-5555-5555-8555-555555555555',
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId: '33333333-3333-3333-3333-333333333333',
      sourceTemplateTimeBlockId: '77777777-7777-7777-8777-777777777777',
      serves: true,
      shiftSplit: { kind: 'equal', count: 2 },
      headcounts: [
        {
          roleId: RoleId.from('88888888-8888-8888-8888-888888888888'),
          count: 3,
        },
      ],
    },
  });
}

function createMinistry(defaultDirection: 'all_in' | 'all_out'): Ministry {
  return new Ministry(
    {
      churchId: '11111111-1111-1111-1111-111111111111',
      name: 'Projection',
      defaultDirection,
    },
    '33333333-3333-3333-3333-333333333333',
    new Date('2026-07-01T00:00:00.000Z'),
    new Date('2026-07-01T00:00:00.000Z'),
  );
}

beforeAll(async () => {
  app = await createFastify();
  const controller = new ChurchAdminController({
    cycleManager: cycleManager as never,
    eventTemplateManager: templateManager as never,
    planningEventManager: planningEventManager as never,
    activeChurchResolver: activeChurchResolver as never,
    participationManager: participationManager as never,
    ministryManager: ministryManager as never,
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

    cycleManager.createCycle.mockRejectedValueOnce(new OverlappingCycleError());
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
      new IllegalStateTransitionError('sent', 'sent'),
    );
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/cycles/22222222-2222-2222-2222-222222222222/send',
    });

    expect(conflict.statusCode).toBe(409);
  });

  it('POST /api/v1/admin/cycles/:id/apply-templates returns 201 and 422 for invalid bodies', async () => {
    planningEventManager.generateFromTemplates.mockResolvedValue({
      generatedEventCount: 5,
      generatedEventTimeBlockCount: 9,
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
    // Quick-create sends already church-local bounds; the controller no
    // longer reinterprets them (no datesRepresentChurchCalendarDays flag).
    // The church-timezone day-placement proof itself (a real church, a real
    // DB) lives at the manager layer in
    // tests/application/planning-phase3.managers.test.ts — this test's job
    // is only to confirm the HTTP layer doesn't reintroduce reinterpretation
    // between the wire and the manager call.
    planningEventManager.createEvent.mockResolvedValue(
      new Event(
        {
          churchId: '11111111-1111-1111-1111-111111111111',
          cycleId: '22222222-2222-2222-2222-222222222222',
          title: 'Domingo',
          start: parseInstant({ value: '2026-06-28T03:00:00.000Z' }),
          end: parseInstant({ value: '2026-06-29T02:59:59.999Z' }),
        },
        '33333333-3333-3333-3333-333333333333',
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-06-01T00:00:00.000Z'),
      ),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/cycles/22222222-2222-2222-2222-222222222222/events',
      payload: {
        title: 'Domingo',
        start: '2026-06-28T03:00:00.000Z',
        end: '2026-06-29T02:59:59.999Z',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(planningEventManager.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        start: new Date('2026-06-28T03:00:00.000Z'),
        end: new Date('2026-06-29T02:59:59.999Z'),
      }),
    );
    expect(planningEventManager.createEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        datesRepresentChurchCalendarDays: expect.anything(),
      }),
    );
  });

  it('serves ministry profile routes and returns updated default direction', async () => {
    const usualSetup = createUsualSetup();
    participationManager.getUsualSetup.mockResolvedValue([usualSetup]);
    participationManager.upsertUsualSetup.mockResolvedValue([usualSetup]);
    ministryManager.setDefaultDirection.mockResolvedValue(
      createMinistry('all_in'),
    );

    const getResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ministries/33333333-3333-3333-3333-333333333333/usual-setup',
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual({
      entries: [
        {
          id: '55555555-5555-5555-8555-555555555555',
          ministryId: '33333333-3333-3333-3333-333333333333',
          sourceTemplateTimeBlockId: '77777777-7777-7777-8777-777777777777',
          serves: true,
          shiftSplit: { kind: 'equal', count: 2 },
          headcounts: [
            {
              roleId: '88888888-8888-8888-8888-888888888888',
              count: 3,
            },
          ],
        },
      ],
    });

    const putResponse = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/ministries/33333333-3333-3333-3333-333333333333/usual-setup',
      payload: {
        entries: [
          {
            sourceTemplateTimeBlockId: '77777777-7777-7777-8777-777777777777',
            serves: true,
            shiftSplit: { kind: 'equal', count: 2 },
            headcounts: [
              {
                roleId: '88888888-8888-8888-8888-888888888888',
                count: 3,
              },
            ],
          },
        ],
      },
    });

    expect(putResponse.statusCode).toBe(200);

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

  it('POST .../slots: creates a slot and returns 201, and returns 409 for a sent cycle', async () => {
    const cycleId = '22222222-2222-2222-2222-222222222222';
    const eventId = '66666666-6666-6666-6666-666666666666';
    const eventTimeBlocksUrl = `/api/v1/admin/cycles/${cycleId}/events/${eventId}/slots`;

    planningEventManager.createEventTimeBlock.mockResolvedValue({
      id: '99999999-9999-9999-9999-999999999999',
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId,
      startTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
      endTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
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
      new IllegalStateTransitionError('scheduled', 'update'),
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

  it('PATCH/DELETE .../slots/:eventTimeBlockId: happy paths, 404, 409 locked, 409 last remaining slot', async () => {
    const cycleId = '22222222-2222-2222-2222-222222222222';
    const eventId = '66666666-6666-6666-6666-666666666666';
    const eventTimeBlockId = '99999999-9999-9999-9999-999999999999';
    const eventTimeBlockUrl = `/api/v1/admin/cycles/${cycleId}/events/${eventId}/slots/${eventTimeBlockId}`;

    planningEventManager.updateEventTimeBlock.mockResolvedValue({
      id: eventTimeBlockId,
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId,
      startTime: parseInstant({ value: '2026-08-02T09:00:00.000Z' }),
      endTime: parseInstant({ value: '2026-08-02T10:00:00.000Z' }),
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
      new IllegalStateTransitionError('scheduled', 'update'),
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
});
