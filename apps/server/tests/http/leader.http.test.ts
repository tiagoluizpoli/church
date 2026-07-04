import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { LeaderController } from '../../src/api/controllers/leader-controller';
import { Shift } from '../../src/domain/entities/shift';
import { IllegalStateTransitionError } from '../../src/domain/errors/illegal-state-transition';
import { ShiftOutOfBoundsError } from '../../src/domain/errors/shift-out-of-bounds';
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

const participationManager = {
  getCycleParticipation: vi.fn(),
  setInclusions: vi.fn(),
  splitShifts: vi.fn(),
  updateShift: vi.fn(),
  deleteShift: vi.fn(),
  upsertRequirement: vi.fn(),
};

const availabilityCheckManager = {
  fireAvailability: vi.fn(),
  listCycleCheckStatuses: vi.fn(),
  resendReminder: vi.fn(),
};

const volunteerManager = {
  resolveVolunteerContext: vi.fn(),
};

const rbacGuard = {
  canManageMinistry: vi.fn(),
  canManageParticipation: vi.fn(),
  canManageShift: vi.fn(),
};

let app: FastifyTypedInstance;

function createVolunteerContext(
  input?: Partial<MockVolunteerContext>,
): MockVolunteerContext {
  return {
    churchId: '11111111-1111-1111-1111-111111111111',
    volunteerId: '44444444-4444-4444-8444-444444444444',
    isAdmin: false,
    isLeader: true,
    ...input,
  };
}

function createShift(): Shift {
  return new Shift({
    id: '66666666-6666-6666-8666-666666666666',
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      participationId: '22222222-2222-2222-8222-222222222222',
      timeSlotId: '33333333-3333-3333-8333-333333333333',
      startTime: new Date('2026-08-03T09:00:00.000Z'),
      endTime: new Date('2026-08-03T10:00:00.000Z'),
      label: 'Welcome',
    },
    slotBounds: {
      startTime: new Date('2026-08-03T09:00:00.000Z'),
      endTime: new Date('2026-08-03T10:00:00.000Z'),
    },
  });
}

beforeAll(async () => {
  app = await createFastify();
  const controller = new LeaderController(
    participationManager as never,
    availabilityCheckManager as never,
    volunteerManager as never,
    rbacGuard as never,
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
    user: { id: 'leader-user' },
  } as never);
  volunteerManager.resolveVolunteerContext.mockResolvedValue(
    createVolunteerContext(),
  );
  rbacGuard.canManageMinistry.mockResolvedValue(true);
  rbacGuard.canManageParticipation.mockResolvedValue(true);
  rbacGuard.canManageShift.mockResolvedValue(true);
});

describe('Leader participation routes', () => {
  it('POST /api/v1/leader/participations/:id/slots/:slotId/shifts returns 201', async () => {
    participationManager.splitShifts.mockResolvedValue([createShift()]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/leader/participations/22222222-2222-2222-8222-222222222222/slots/33333333-3333-3333-8333-333333333333/shifts',
      payload: {
        strategy: {
          kind: 'equal-n',
          n: 1,
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      shifts: [
        {
          id: '66666666-6666-6666-8666-666666666666',
          participationId: '22222222-2222-2222-8222-222222222222',
          timeSlotId: '33333333-3333-3333-8333-333333333333',
          startTime: '2026-08-03T09:00:00.000Z',
          endTime: '2026-08-03T10:00:00.000Z',
          label: 'Welcome',
        },
      ],
    });
  });

  it('POST /api/v1/leader/participations/:id/slots/:slotId/shifts returns 409 for out-of-bounds splits', async () => {
    participationManager.splitShifts.mockRejectedValue(
      new ShiftOutOfBoundsError(),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/leader/participations/22222222-2222-2222-8222-222222222222/slots/33333333-3333-3333-8333-333333333333/shifts',
      payload: {
        strategy: {
          kind: 'manual',
          spans: [
            {
              startTime: '2026-08-03T08:00:00.000Z',
              endTime: '2026-08-03T11:00:00.000Z',
            },
          ],
        },
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'SHIFT_OUT_OF_BOUNDS',
      message: 'Shift must be within its time slot bounds',
    });
  });

  it('POST /api/v1/leader/participations/:id/slots/:slotId/shifts returns 403 for another ministry scope', async () => {
    rbacGuard.canManageParticipation.mockResolvedValue(false);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/leader/participations/22222222-2222-2222-8222-222222222222/slots/33333333-3333-3333-8333-333333333333/shifts',
      payload: {
        strategy: {
          kind: 'equal-n',
          n: 2,
        },
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Participation belongs to another ministry',
    });
  });

  it('POST /api/v1/leader/participations/:id/fire-availability returns 202', async () => {
    availabilityCheckManager.fireAvailability.mockResolvedValue({
      createdCheckCount: 4,
      notifiedVolunteerCount: 4,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/leader/participations/22222222-2222-2222-8222-222222222222/fire-availability',
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      createdCheckCount: 4,
      notifiedVolunteerCount: 4,
    });
  });

  it('POST /api/v1/leader/participations/:id/fire-availability returns 409 for wrong state', async () => {
    availabilityCheckManager.fireAvailability.mockRejectedValue(
      new IllegalStateTransitionError('availability_fired', 'fire'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/leader/participations/22222222-2222-2222-8222-222222222222/fire-availability',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'ILLEGAL_STATE_TRANSITION',
      message: 'Cannot transition from availability_fired to fire',
    });
  });

  it('GET /api/v1/leader/cycles/:id/availability-status returns 200', async () => {
    availabilityCheckManager.listCycleCheckStatuses.mockResolvedValue([
      {
        volunteerId: 'vol-1',
        volunteerName: 'E2E Volunteer',
        state: 'confirmed',
        confirmedAt: new Date('2026-08-03T10:00:00.000Z'),
      },
      {
        volunteerId: 'vol-2',
        volunteerName: 'Grace Hopper',
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/leader/cycles/11111111-1111-1111-8111-111111111111/availability-status?ministryId=22222222-2222-2222-8222-222222222222',
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
});
