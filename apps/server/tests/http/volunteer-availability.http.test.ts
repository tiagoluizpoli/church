import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { VolunteerController } from '../../src/api/controllers/volunteer-controller';
import { AvailabilityOverlapError } from '../../src/domain/errors/availability-overlap';
import { CheckAccessDeniedError } from '../../src/domain/errors/check-access-denied';
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

const volunteerManager = {
  resolveVolunteerContext: vi.fn(),
  getDashboard: vi.fn(),
  getUpcomingAssignments: vi.fn(),
  getMinistrySchedule: vi.fn(),
  respondToAssignment: vi.fn(),
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  listAvailabilityChecks: vi.fn(),
  getAvailabilityCheck: vi.fn(),
  setUnavailability: vi.fn(),
  confirmAvailabilityCheck: vi.fn(),
};

let app: FastifyTypedInstance;

const CHECK_ID = '77777777-7777-4777-8777-777777777777';
const SHIFT_ID = '66666666-6666-4666-8666-666666666666';

interface MockCheckDetail {
  id: string;
  planningCycleId: string;
  planningCycleName: string;
  ministryId: string;
  ministryName: string;
  state: 'pending' | 'confirmed';
  confirmedAt?: Date;
  shifts: Array<{
    shiftId: string;
    eventId: string;
    eventTitle: string;
    startTime: Date;
    endTime: Date;
    label?: string;
    available: boolean;
  }>;
}

function createCheckDetail(): MockCheckDetail {
  return {
    id: CHECK_ID,
    planningCycleId: '22222222-2222-4222-8222-222222222222',
    planningCycleName: 'August 2026',
    ministryId: '33333333-3333-4333-8333-333333333331',
    ministryName: 'Scheduling Ministry A',
    state: 'pending',
    shifts: [
      {
        shiftId: SHIFT_ID,
        eventId: '88888888-8888-4888-8888-888888888888',
        eventTitle: 'Sunday Service',
        startTime: new Date('2026-08-02T12:00:00.000Z'),
        endTime: new Date('2026-08-02T15:00:00.000Z'),
        label: 'Morning',
        available: false,
      },
    ],
  };
}

beforeAll(async () => {
  app = await createFastify();
  const controller = new VolunteerController(volunteerManager as never);
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
  } as never);
  volunteerManager.resolveVolunteerContext.mockResolvedValue({
    churchId: '11111111-1111-4111-8111-111111111111',
    volunteerId: '55555555-5555-4555-8555-555555555551',
    isAdmin: false,
    isLeader: false,
  });
});

describe('Volunteer availability-check routes (DL3-HT-08)', () => {
  it('GET /api/v1/volunteer/availability-checks returns 200 with summaries', async () => {
    volunteerManager.listAvailabilityChecks.mockResolvedValue([
      {
        id: CHECK_ID,
        planningCycleId: '22222222-2222-4222-8222-222222222222',
        planningCycleName: 'August 2026',
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

  it('PUT /api/v1/volunteer/availability-checks/:checkId/marks returns 200 for the owner', async () => {
    volunteerManager.setUnavailability.mockResolvedValue(createCheckDetail());

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/marks`,
      payload: { shiftIds: [SHIFT_ID] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().shifts[0].available).toBe(false);
    expect(volunteerManager.setUnavailability).toHaveBeenCalledWith(
      expect.objectContaining({
        checkId: CHECK_ID,
        shiftIds: [SHIFT_ID],
      }),
    );
  });

  it("PUT marks on another volunteer's check returns 403", async () => {
    volunteerManager.setUnavailability.mockRejectedValue(
      new CheckAccessDeniedError(),
    );

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/marks`,
      payload: { shiftIds: [SHIFT_ID] },
    });

    expect(response.statusCode).toBe(403);
  });

  it('PUT marks accepts whole-day dates', async () => {
    volunteerManager.setUnavailability.mockResolvedValue(createCheckDetail());

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/marks`,
      payload: { shiftIds: [], wholeDayDates: ['2026-08-02'] },
    });

    expect(response.statusCode).toBe(200);
    expect(volunteerManager.setUnavailability).toHaveBeenCalledWith(
      expect.objectContaining({ wholeDayDates: ['2026-08-02'] }),
    );
  });
});

describe('Volunteer availability-check confirm (DL3-HT-09)', () => {
  it('POST /api/v1/volunteer/availability-checks/:checkId/confirm returns 204', async () => {
    volunteerManager.confirmAvailabilityCheck.mockResolvedValue({
      state: 'confirmed',
      confirmedAt: new Date('2026-07-15T10:00:00.000Z'),
      overlaps: [],
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/confirm`,
    });

    expect(response.statusCode).toBe(204);
  });

  it('confirm with a blocked overlap (flag OFF) returns 409', async () => {
    volunteerManager.confirmAvailabilityCheck.mockRejectedValue(
      new AvailabilityOverlapError(),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/confirm`,
    });

    expect(response.statusCode).toBe(409);
  });

  it('confirm with flag ON returns 204 even when conflicts were flagged', async () => {
    volunteerManager.confirmAvailabilityCheck.mockResolvedValue({
      state: 'confirmed',
      confirmedAt: new Date('2026-07-15T10:00:00.000Z'),
      overlaps: [
        {
          shiftId: SHIFT_ID,
          otherShiftId: '99999999-9999-4999-8999-999999999999',
          ministryId: '33333333-3333-4333-8333-333333333331',
          otherMinistryId: '33333333-3333-4333-8333-333333333332',
        },
      ],
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/confirm`,
    });

    expect(response.statusCode).toBe(204);
  });

  it("confirming another volunteer's check returns 403", async () => {
    volunteerManager.confirmAvailabilityCheck.mockRejectedValue(
      new CheckAccessDeniedError(),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/confirm`,
    });

    expect(response.statusCode).toBe(403);
  });
});
