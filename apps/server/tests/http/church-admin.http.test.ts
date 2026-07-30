import { NotFoundError } from '@church/core';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ChurchAdminController } from '../../src/api/controllers/church-admin-controller';
import { RoleId } from '../../src/domain/branded-ids';
import { Ministry } from '../../src/domain/entities/ministry';
import { MinistryServingProfile } from '../../src/domain/entities/ministry-serving-profile';
import { IllegalStateTransitionError } from '../../src/domain/errors/illegal-state-transition';
import { LastRemainingSlotError } from '../../src/domain/errors/last-remaining-slot-error';
import { OverlappingCycleError } from '../../src/domain/errors/overlapping-cycle';
import { createFastify } from '../../src/main/fastify/setup';
import type { FastifyTypedInstance } from '../../src/main/fastify/types';

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
  lockCycle: vi.fn(),
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
  createSlot: vi.fn(),
  updateSlot: vi.fn(),
  deleteSlot: vi.fn(),
};

const participationManager = {
  getServingProfile: vi.fn(),
  upsertServingProfile: vi.fn(),
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

function createServingProfile(): MinistryServingProfile {
  return new MinistryServingProfile({
    id: '55555555-5555-5555-8555-555555555555',
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId: '33333333-3333-3333-3333-333333333333',
      sourceTemplateBlockId: '77777777-7777-7777-8777-777777777777',
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
      enforcementType: 'soft',
      defaultDirection,
    },
    '33333333-3333-3333-3333-333333333333',
    new Date('2026-07-01T00:00:00.000Z'),
    new Date('2026-07-01T00:00:00.000Z'),
  );
}

beforeAll(async () => {
  app = await createFastify();
  const controller = new ChurchAdminController(
    cycleManager as never,
    templateManager as never,
    planningEventManager as never,
    activeChurchResolver as never,
    participationManager as never,
    ministryManager as never,
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
    user: { id: 'sched-admin-user' },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue(
    createActiveChurchResolution(),
  );
  authorityGuard.canManageChurch.mockResolvedValue(true);
});

describe('Church admin planning routes', () => {
  it('POST /api/v1/admin/planning-cycles returns 201 and 409 for overlap conflicts', async () => {
    cycleManager.createCycle.mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      churchId: '11111111-1111-1111-1111-111111111111',
      name: 'August 2026',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
      state: 'draft',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    const success = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/planning-cycles',
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
      url: '/api/v1/admin/planning-cycles',
      payload: {
        name: 'Overlap',
        startDate: '2026-08-15',
        endDate: '2026-09-15',
      },
    });

    expect(conflict.statusCode).toBe(409);
  });

  it('POST /api/v1/admin/planning-cycles/:id/lock returns 204 and 403 for non-admin users', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/planning-cycles/22222222-2222-2222-2222-222222222222/lock',
    });

    expect(ok.statusCode).toBe(204);

    authorityGuard.canManageChurch.mockResolvedValueOnce(false);

    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/planning-cycles/22222222-2222-2222-2222-222222222222/lock',
    });

    expect(forbidden.statusCode).toBe(403);

    cycleManager.lockCycle.mockRejectedValueOnce(
      new IllegalStateTransitionError('locked', 'locked'),
    );
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/planning-cycles/22222222-2222-2222-2222-222222222222/lock',
    });

    expect(conflict.statusCode).toBe(409);
  });

  it('POST /api/v1/admin/planning-cycles/:id/apply-templates returns 201 and 422 for invalid bodies', async () => {
    planningEventManager.generateFromTemplates.mockResolvedValue({
      generatedEventCount: 5,
      generatedSlotCount: 9,
    });

    const success = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/planning-cycles/22222222-2222-2222-2222-222222222222/apply-templates',
      payload: {
        templateIds: ['33333333-3333-3333-3333-333333333333'],
      },
    });

    expect(success.statusCode).toBe(201);
    expect(success.json()).toEqual({
      generatedEventCount: 5,
      generatedSlotCount: 9,
    });

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/planning-cycles/22222222-2222-2222-2222-222222222222/apply-templates',
      payload: {
        templateIds: [],
      },
    });

    expect(invalid.statusCode).toBe(422);
  });

  it('serves ministry profile routes and returns updated default direction', async () => {
    const servingProfile = createServingProfile();
    participationManager.getServingProfile.mockResolvedValue([servingProfile]);
    participationManager.upsertServingProfile.mockResolvedValue([
      servingProfile,
    ]);
    ministryManager.setDefaultDirection.mockResolvedValue(
      createMinistry('all_in'),
    );

    const getResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ministries/33333333-3333-3333-3333-333333333333/serving-profile',
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual({
      entries: [
        {
          id: '55555555-5555-5555-8555-555555555555',
          ministryId: '33333333-3333-3333-3333-333333333333',
          sourceTemplateBlockId: '77777777-7777-7777-8777-777777777777',
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
      url: '/api/v1/admin/ministries/33333333-3333-3333-3333-333333333333/serving-profile',
      payload: {
        entries: [
          {
            sourceTemplateBlockId: '77777777-7777-7777-8777-777777777777',
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
      enforcementType: 'soft',
    });
  });

  it('POST .../slots: creates a slot and returns 201, and returns 409 for a locked cycle', async () => {
    const cycleId = '22222222-2222-2222-2222-222222222222';
    const eventId = '66666666-6666-6666-6666-666666666666';
    const slotsUrl = `/api/v1/admin/planning-cycles/${cycleId}/events/${eventId}/slots`;

    planningEventManager.createSlot.mockResolvedValue({
      id: '99999999-9999-9999-9999-999999999999',
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId,
      startTime: new Date('2026-08-02T09:00:00.000Z'),
      endTime: new Date('2026-08-02T10:00:00.000Z'),
      label: 'Worship',
      status: 'active',
      requirements: [],
    });

    const success = await app.inject({
      method: 'POST',
      url: slotsUrl,
      payload: {
        startTime: '2026-08-02T09:00:00.000Z',
        endTime: '2026-08-02T10:00:00.000Z',
        label: 'Worship',
      },
    });
    expect(success.statusCode).toBe(201);
    expect(success.json()).toMatchObject({ label: 'Worship' });

    planningEventManager.createSlot.mockRejectedValueOnce(
      new IllegalStateTransitionError('scheduled', 'update'),
    );
    const locked = await app.inject({
      method: 'POST',
      url: slotsUrl,
      payload: {
        startTime: '2026-08-02T09:00:00.000Z',
        endTime: '2026-08-02T10:00:00.000Z',
      },
    });
    expect(locked.statusCode).toBe(409);
  });

  it('PATCH/DELETE .../slots/:slotId: happy paths, 404, 409 locked, 409 last remaining slot', async () => {
    const cycleId = '22222222-2222-2222-2222-222222222222';
    const eventId = '66666666-6666-6666-6666-666666666666';
    const slotId = '99999999-9999-9999-9999-999999999999';
    const slotUrl = `/api/v1/admin/planning-cycles/${cycleId}/events/${eventId}/slots/${slotId}`;

    planningEventManager.updateSlot.mockResolvedValue({
      id: slotId,
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId,
      startTime: new Date('2026-08-02T09:00:00.000Z'),
      endTime: new Date('2026-08-02T10:00:00.000Z'),
      label: 'Worship',
      status: 'active',
      requirements: [],
    });

    const updateOk = await app.inject({
      method: 'PATCH',
      url: slotUrl,
      payload: { label: 'Worship' },
    });
    expect(updateOk.statusCode).toBe(200);
    expect(updateOk.json()).toMatchObject({ id: slotId, label: 'Worship' });

    planningEventManager.deleteSlot.mockResolvedValue(undefined);
    const deleteOk = await app.inject({ method: 'DELETE', url: slotUrl });
    expect(deleteOk.statusCode).toBe(204);

    planningEventManager.updateSlot.mockRejectedValueOnce(
      new NotFoundError(`TimeSlot not found: ${slotId}`),
    );
    const notFound = await app.inject({
      method: 'PATCH',
      url: slotUrl,
      payload: { label: 'Mismatched' },
    });
    expect(notFound.statusCode).toBe(404);

    planningEventManager.updateSlot.mockRejectedValueOnce(
      new IllegalStateTransitionError('scheduled', 'update'),
    );
    const locked = await app.inject({
      method: 'PATCH',
      url: slotUrl,
      payload: { label: 'Too late' },
    });
    expect(locked.statusCode).toBe(409);

    planningEventManager.deleteSlot.mockRejectedValueOnce(
      new LastRemainingSlotError(),
    );
    const lastSlot = await app.inject({ method: 'DELETE', url: slotUrl });
    expect(lastSlot.statusCode).toBe(409);
  });
});
