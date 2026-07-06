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
import { VolunteerController } from './volunteer-controller';

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
  getPublishedSchedule: vi.fn(),
  getMinistrySchedule: vi.fn(),
  listAvailabilityChecks: vi.fn(),
  getAvailabilityCheck: vi.fn(),
  setUnavailability: vi.fn(),
  confirmAvailabilityCheck: vi.fn(),
  respondToAssignment: vi.fn(),
  cancelOwnAssignment: vi.fn(),
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
};

let app: FastifyTypedInstance;

const CHURCH_ID = '11111111-1111-4111-8111-111111111111';
const VOLUNTEER_ID = '55555555-5555-4555-8555-555555555551';

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
    churchId: CHURCH_ID,
    volunteerId: VOLUNTEER_ID,
    isAdmin: false,
    isLeader: false,
  });
});

describe('GET /api/v1/volunteer/notifications (C1 pagination)', () => {
  it('passes cursor and limit querystring through to the manager', async () => {
    volunteerManager.getNotifications.mockResolvedValue({
      items: [],
      nextCursor: undefined,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/volunteer/notifications?cursor=2026-07-01T00%3A00%3A00.000Z&limit=5',
    });

    expect(response.statusCode).toBe(200);
    expect(volunteerManager.getNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        volunteerId: VOLUNTEER_ID,
        churchId: CHURCH_ID,
        cursor: new Date('2026-07-01T00:00:00.000Z'),
        limit: 5,
      }),
    );
  });

  it('calls the manager without cursor/limit when the querystring is absent', async () => {
    volunteerManager.getNotifications.mockResolvedValue({
      items: [],
      nextCursor: undefined,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/volunteer/notifications',
    });

    expect(response.statusCode).toBe(200);
    expect(volunteerManager.getNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        volunteerId: VOLUNTEER_ID,
        churchId: CHURCH_ID,
        cursor: undefined,
        limit: undefined,
      }),
    );
  });

  it('includes nextCursor in the response when the manager returns more pages', async () => {
    volunteerManager.getNotifications.mockResolvedValue({
      items: [],
      nextCursor: new Date('2026-07-02T00:00:00.000Z'),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/volunteer/notifications',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().nextCursor).toBe('2026-07-02T00:00:00.000Z');
  });
});
