import { appConfig, withAllParkedOn } from '@church/app-config';
import { NotFoundError } from '@church/core';
import { m } from '@church/i18n/messages';
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
import { AssignmentAccessDeniedError } from '@/domain/errors/assignment-access-denied';
import { CheckAccessDeniedError } from '@/domain/errors/check-access-denied';
import { IsolationBreachError } from '@/domain/errors/isolation-breach-error';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testLocale } from '@/tests/test-support/fastify-locale';

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
  getPublishedSchedule: vi.fn(),
  getMinistrySchedule: vi.fn(),
  listAvailabilityChecks: vi.fn(),
  getAvailabilityCheck: vi.fn(),
  setUnavailableShifts: vi.fn(),
  confirmAvailabilityCheck: vi.fn(),
  respondToAssignment: vi.fn(),
  cancelOwnAssignment: vi.fn(),
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

let app: FastifyTypedInstance;

const CHURCH_ID = '11111111-1111-4111-8111-111111111111';
const VOLUNTEER_ID = '55555555-5555-4555-8555-555555555551';
const MINISTRY_ID = '66666666-6666-4666-8666-666666666661';

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
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
    churchId: CHURCH_ID,
    volunteerId: VOLUNTEER_ID,
    hasVolunteerMembership: true,
    autoSelected: false,
  });
});

const CHECK_ID = '77777777-7777-4777-8777-777777777771';
const NOTIFICATION_ID = '88888888-8888-4888-8888-888888888881';
const GENERIC_NOT_FOUND = { error: 'NOT_FOUND', message: m.error_not_found() };

const servingCollections = [
  { method: 'GET' as const, url: '/api/v1/volunteer/dashboard' },
  { method: 'GET' as const, url: '/api/v1/volunteer/assignments' },
  { method: 'GET' as const, url: '/api/v1/volunteer/availability-checks' },
  { method: 'GET' as const, url: '/api/v1/volunteer/notifications' },
  { method: 'POST' as const, url: '/api/v1/volunteer/notifications/read-all' },
];

describe('Volunteer route access', () => {
  it.each(
    servingCollections,
  )('$method $url returns 401 only when signed out', async ({
    method,
    url,
  }) => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({ method, url });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'UNAUTHORIZED',
      message: 'Autenticação necessária.',
    });
    expect(activeChurchResolver.resolve).not.toHaveBeenCalled();
  });

  it.each(
    servingCollections,
  )('$method $url returns 403 for a leftover profile without an active Ministry Membership', async ({
    method,
    url,
  }) => {
    activeChurchResolver.resolve.mockResolvedValue({
      status: 'resolved',
      churchId: CHURCH_ID,
      volunteerId: VOLUNTEER_ID,
      hasVolunteerMembership: false,
      autoSelected: false,
    });

    const response = await app.inject({ method, url });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('FORBIDDEN');
    for (const operation of Object.values(volunteerManager)) {
      expect(operation).not.toHaveBeenCalled();
    }
  });

  it.each([
    {
      name: 'GET check',
      method: 'GET' as const,
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}`,
      operation: volunteerManager.getAvailabilityCheck,
      payload: undefined,
    },
    {
      name: 'PUT unavailable shifts',
      method: 'PUT' as const,
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/unavailable-shifts`,
      operation: volunteerManager.setUnavailableShifts,
      payload: { shiftIds: [] },
    },
    {
      name: 'POST confirm',
      method: 'POST' as const,
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}/confirm`,
      operation: volunteerManager.confirmAvailabilityCheck,
      payload: undefined,
    },
  ])("$name returns the same 404 for a missing and another Volunteer's check", async ({
    method,
    url,
    operation,
    payload,
  }) => {
    operation.mockRejectedValueOnce(
      new NotFoundError(`Availability check not found: ${CHECK_ID}`),
    );
    const missing = await app.inject({ method, url, payload });
    operation.mockRejectedValueOnce(new CheckAccessDeniedError());
    const hidden = await app.inject({ method, url, payload });

    expect(missing.statusCode).toBe(404);
    expect(hidden.statusCode).toBe(404);
    expect(missing.json()).toEqual(GENERIC_NOT_FOUND);
    expect(hidden.json()).toEqual(GENERIC_NOT_FOUND);
    expect(operation).toHaveBeenCalledWith(
      expect.objectContaining({ checkId: CHECK_ID, volunteerId: VOLUNTEER_ID }),
    );
  });

  it('returns a serving Volunteer their own check', async () => {
    volunteerManager.getAvailabilityCheck.mockResolvedValue({
      id: CHECK_ID,
      cycleId: 'cycle-1',
      cycleName: 'August',
      ministryId: MINISTRY_ID,
      ministryName: 'Kids',
      state: 'pending',
      confirmedAt: undefined,
      shifts: [],
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/volunteer/availability-checks/${CHECK_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(CHECK_ID);
  });

  it('returns the same 404 for a missing and a non-member Ministry schedule', async () => {
    const url = `/api/v1/volunteer/ministries/${MINISTRY_ID}/schedule`;
    volunteerManager.getMinistrySchedule.mockRejectedValueOnce(
      new NotFoundError(`Ministry not found: ${MINISTRY_ID}`),
    );
    const missing = await app.inject({ method: 'GET', url });
    volunteerManager.getMinistrySchedule.mockRejectedValueOnce(
      new IsolationBreachError(),
    );
    const hidden = await app.inject({ method: 'GET', url });

    expect(missing.statusCode).toBe(404);
    expect(hidden.statusCode).toBe(404);
    expect(missing.json()).toEqual(GENERIC_NOT_FOUND);
    expect(hidden.json()).toEqual(GENERIC_NOT_FOUND);
  });

  it("returns the generic 404 for a missing or another Volunteer's notification", async () => {
    volunteerManager.markNotificationRead.mockRejectedValue(
      new NotFoundError('Resource not found'),
    );

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/volunteer/notifications/${NOTIFICATION_ID}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(GENERIC_NOT_FOUND);
    expect(volunteerManager.markNotificationRead).toHaveBeenCalledWith({
      notificationId: NOTIFICATION_ID,
      volunteerId: VOLUNTEER_ID,
      churchId: CHURCH_ID,
    });
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

describe('GET /api/v1/volunteer/ministries/:ministryId/schedule', () => {
  it('returns the Sector for occupied and open requirement rows', async () => {
    volunteerManager.getMinistrySchedule.mockResolvedValue({
      ministryId: MINISTRY_ID,
      ministryName: 'Kids',
      events: [
        {
          eventId: 'event-1',
          title: 'Sunday',
          start: '2026-07-06T09:00:00.000Z',
          end: '2026-07-06T11:00:00.000Z',
          assignmentCount: 1,
          rows: [
            {
              eventTimeBlockId: 'time-block-1',
              eventTimeBlockLabel: 'Morning',
              sectorName: 'Babies Room',
              roleName: 'Teacher',
              volunteerDisplayName: 'Alice T.',
              confirmationState: 'confirmed',
            },
            {
              eventTimeBlockId: 'time-block-1',
              eventTimeBlockLabel: 'Morning',
              sectorName: 'Kids Room',
              roleName: 'Teacher',
              confirmationState: 'open',
            },
          ],
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/volunteer/ministries/${MINISTRY_ID}/schedule`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events[0].rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sectorName: 'Babies Room',
          roleName: 'Teacher',
        }),
        expect.objectContaining({
          sectorName: 'Kids Room',
          roleName: 'Teacher',
          confirmationState: 'open',
        }),
      ]),
    );
  });
});

describe('PATCH /api/v1/volunteer/assignments/:assignmentId (parked)', () => {
  const url =
    '/api/v1/volunteer/assignments/66666666-6666-4666-8666-666666666666';
  const body = { response: 'accepted' };

  async function buildApp(config: typeof appConfig) {
    const instance = await createFastify({ locale: testLocale });
    const controller = new VolunteerController({
      volunteerManager: volunteerManager as never,
      activeChurchResolver: activeChurchResolver as never,
      config,
    });
    await instance.register(
      async (scope) => {
        scope.register(controller.registerRoutes.bind(controller), {
          prefix: controller.prefix,
        });
      },
      { prefix: '/api/v1' },
    );
    await instance.ready();
    return instance;
  }

  it('gets 404 with the real config', async () => {
    const response = await app.inject({ method: 'PATCH', url, payload: body });

    expect(response.statusCode).toBe(404);
    expect(volunteerManager.respondToAssignment).not.toHaveBeenCalled();
  });

  it('reaches the manager with the switch on', async () => {
    const parkedOn = await buildApp(withAllParkedOn(appConfig) as never);
    volunteerManager.respondToAssignment.mockRejectedValue(new Error('stop'));

    await parkedOn.inject({ method: 'PATCH', url, payload: body });

    expect(volunteerManager.respondToAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        response: 'accepted',
        volunteerId: VOLUNTEER_ID,
      }),
    );
    await parkedOn.close();
  });

  it('returns generic 404 for another Volunteer when the switch is on', async () => {
    const parkedOn = await buildApp(withAllParkedOn(appConfig) as never);
    volunteerManager.respondToAssignment.mockRejectedValue(
      new AssignmentAccessDeniedError(),
    );

    const response = await parkedOn.inject({
      method: 'PATCH',
      url,
      payload: body,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NOT_FOUND',
      message: m.error_not_found(),
    });
    await parkedOn.close();
  });
});

describe('POST /api/v1/volunteer/assignments/:assignmentId/cancel (parked)', () => {
  const url =
    '/api/v1/volunteer/assignments/66666666-6666-4666-8666-666666666666/cancel';

  it('gets 404 with the real config', async () => {
    const response = await app.inject({ method: 'POST', url });

    expect(response.statusCode).toBe(404);
    expect(volunteerManager.cancelOwnAssignment).not.toHaveBeenCalled();
  });
});
