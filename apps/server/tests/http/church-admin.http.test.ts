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
import { IllegalStateTransitionError } from '../../src/domain/errors/illegal-state-transition';
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

interface MockVolunteerContext {
  churchId: string;
  volunteerId: string;
  isAdmin: boolean;
  isLeader: boolean;
}

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
};

const volunteerManager = {
  resolveVolunteerContext: vi.fn(),
};

let app: FastifyTypedInstance;

function createVolunteerContext(input?: Partial<MockVolunteerContext>) {
  return {
    churchId: '11111111-1111-1111-1111-111111111111',
    volunteerId: '44444444-4444-4444-8444-444444444444',
    isAdmin: true,
    isLeader: true,
    ...input,
  };
}

beforeAll(async () => {
  app = await createFastify();
  const controller = new ChurchAdminController(
    cycleManager as never,
    templateManager as never,
    planningEventManager as never,
    volunteerManager as never,
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
  } as never);
  volunteerManager.resolveVolunteerContext.mockResolvedValue(
    createVolunteerContext(),
  );
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

    volunteerManager.resolveVolunteerContext.mockResolvedValue(
      createVolunteerContext({ isAdmin: false }),
    );

    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/planning-cycles/22222222-2222-2222-2222-222222222222/lock',
    });

    expect(forbidden.statusCode).toBe(403);

    volunteerManager.resolveVolunteerContext.mockResolvedValue(
      createVolunteerContext(),
    );
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
});
