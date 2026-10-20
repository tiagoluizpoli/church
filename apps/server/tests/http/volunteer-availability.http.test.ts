import { appConfig } from '@church/app-config';
import { type Instant, parseInstant } from '@church/time';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { VolunteerController } from '@/api/controllers/volunteer-controller';
import { CheckAccessDeniedError } from '@/domain/errors/check-access-denied';
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

const volunteerManager = {
  getDashboard: vi.fn(),
  getUpcomingAssignments: vi.fn(),
  getMinistrySchedule: vi.fn(),
  respondToAssignment: vi.fn(),
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  listAvailabilityChecks: vi.fn(),
  getAvailabilityCheck: vi.fn(),
  setUnavailableShifts: vi.fn(),
  confirmAvailabilityCheck: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

let app: FastifyTypedInstance;

const CHECK_ID = '77777777-7777-4777-8777-777777777777';
const SHIFT_ID = '66666666-6666-4666-8666-666666666666';

interface MockCheckDetail {
  id: string;
  cycleId: string;
  cycleName: string;
  ministryId: string;
  ministryName: string;
  state: 'pending' | 'confirmed';
  confirmedAt?: Instant;
  shifts: Array<{
    shiftId: string;
    eventId: string;
    eventTitle: string;
    startTime: Instant;
    endTime: Instant;
    label?: string;
    available: boolean;
  }>;
}

function createCheckDetail(): MockCheckDetail {
  return {
    id: CHECK_ID,
    cycleId: '22222222-2222-4222-8222-222222222222',
    cycleName: 'August 2026',
    ministryId: '33333333-3333-4333-8333-333333333331',
    ministryName: 'Scheduling Ministry A',
    state: 'pending',
    shifts: [
      {
        shiftId: SHIFT_ID,
        eventId: '88888888-8888-4888-8888-888888888888',
        eventTitle: 'Sunday Service',
        startTime: parseInstant({ value: '2026-08-02T12:00:00.000Z' }),
        endTime: parseInstant({ value: '2026-08-02T15:00:00.000Z' }),
        label: 'Morning',
        available: false,
      },
    ],
  };
}

beforeAll(async () => {
  app = await createFastify();
  const controller = new VolunteerController({
    volunteerManager: volunteerManager as never,
    activeChurchResolver: activeChurchResolver as never,
    config: appConfig,
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
    user: { id: 'volunteer-user' },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: '11111111-1111-4111-8111-111111111111',
    volunteerId: '55555555-5555-4555-8555-555555555551',
    hasVolunteerMembership: true,
    autoSelected: false,
  });
});

describe('Volunteer availability-check routes (DL3-HT-08)', () => {
  it('GET /api/v1/volunteer/availability-checks returns 200 with summaries', async () => {
    volunteerManager.listAvailabilityChecks.mockResolvedValue([
      {
        id: CHECK_ID,
        cycleId: '22222222-2222-4222-8222-222222222222',
        cycleName: 'August 2026',
        ministryId: '33333333-3333-4333-8333-333333333331',
        ministryName: 'Scheduling Ministry A',
        state: 'pending',
        totalShiftCount: 2,
        unavailableShiftCount: 0,
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/volunteer/availability-checks',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().checks).toHaveLength(1);
    expect(response.json().checks[0].id).toBe(CHECK_ID);
  });

  it('PUT /api/v1/volunteer/availability-checks/:checkId/unavailable-shifts returns 200 for the owner', async () => {
    volunteerManager.setUnavailableShifts.mockResolvedValue(
      createCheckDetail(),
    );

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/unavailable-shifts`,
      payload: { shiftIds: [SHIFT_ID] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().shifts[0].available).toBe(false);
    expect(volunteerManager.setUnavailableShifts).toHaveBeenCalledWith(
      expect.objectContaining({
        checkId: CHECK_ID,
        shiftIds: [SHIFT_ID],
      }),
    );
  });

  it("PUT unavailable shifts on another volunteer's check returns generic 404", async () => {
    volunteerManager.setUnavailableShifts.mockRejectedValue(
      new CheckAccessDeniedError(),
    );

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/unavailable-shifts`,
      payload: { shiftIds: [SHIFT_ID] },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NOT_FOUND',
      message: 'Resource not found',
    });
  });

  it('PUT unavailable shifts accepts whole-day dates', async () => {
    volunteerManager.setUnavailableShifts.mockResolvedValue(
      createCheckDetail(),
    );

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/unavailable-shifts`,
      payload: { shiftIds: [], wholeDayDates: ['2026-08-02'] },
    });

    expect(response.statusCode).toBe(200);
    expect(volunteerManager.setUnavailableShifts).toHaveBeenCalledWith(
      expect.objectContaining({ wholeDayDates: ['2026-08-02'] }),
    );
  });
});

describe('Volunteer availability-check confirm (DL3-HT-09)', () => {
  it('POST /api/v1/volunteer/availability-checks/:checkId/confirm returns 204', async () => {
    volunteerManager.confirmAvailabilityCheck.mockResolvedValue({
      state: 'confirmed',
      confirmedAt: new Date('2026-07-15T10:00:00.000Z'),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/confirm`,
    });

    expect(response.statusCode).toBe(204);
  });

  it("confirming another volunteer's check returns generic 404", async () => {
    volunteerManager.confirmAvailabilityCheck.mockRejectedValue(
      new CheckAccessDeniedError(),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/confirm`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NOT_FOUND',
      message: 'Resource not found',
    });
  });
});
