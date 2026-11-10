import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { VolunteerScheduleController } from '@/api/controllers/volunteer-schedule-controller';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
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

const volunteerManager = {
  getPublishedSchedule: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const controller = new VolunteerScheduleController({
    volunteerManager: volunteerManager as never,
    activeChurchResolver: activeChurchResolver as never,
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
    user: { id: 'vol-user' },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: '11111111-1111-1111-1111-111111111111',
    volunteerId: '44444444-4444-4444-8444-444444444444',
    hasVolunteerMembership: true,
    autoSelected: false,
  });
});

describe('Volunteer published schedule route', () => {
  it('GET /api/v1/volunteer/schedule returns assignments and published schedules', async () => {
    const schedule = {
      assignments: [
        {
          assignmentId: 'assign-1',
          eventId: 'event-1',
          eventTitle: 'Sunday Service',
          shiftId: 'shift-1',
          startTime: '2026-08-02T12:00:00.000Z',
          endTime: '2026-08-02T14:00:00.000Z',
          ministryId: 'ministry-1',
          ministryName: 'Music',
          sectorName: 'Stage',
          roleId: 'role-1',
          roleName: 'Singer',
          status: 'confirmed',
        },
      ],
      schedules: [
        {
          ministryId: 'ministry-1',
          ministryName: 'Music',
          cycleId: 'cycle-1',
          cycleName: 'August',
        },
      ],
    };
    volunteerManager.getPublishedSchedule.mockResolvedValue(schedule);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/volunteer/schedule',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(schedule);
    expect(volunteerManager.getPublishedSchedule).toHaveBeenCalledWith({
      volunteerId: '44444444-4444-4444-8444-444444444444',
      churchId: '11111111-1111-1111-1111-111111111111',
    });
  });
});
