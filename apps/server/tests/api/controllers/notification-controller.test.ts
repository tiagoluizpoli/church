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
import { NotificationController } from '@/api/controllers/notification-controller';
import { Notification } from '@/domain/entities/notification';
import { encodeNotificationCursor } from '@/domain/notification-cursor';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@church/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@church/auth')).auth.api.getSession,
);

const CHURCH_ID = '11111111-1111-4111-8111-111111111111';
const NOTIFICATION_ID = '88888888-8888-4888-8888-888888888881';
const MINISTRY_ID = '22222222-2222-4222-8222-222222222222';
const MAX_PAGE_SIZE = 50;

const notificationManager = {
  list: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
};
const activeChurchResolver = { resolve: vi.fn() };

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const controller = new NotificationController({
    notificationManager: notificationManager as never,
    activeChurchResolver: activeChurchResolver as never,
    maxPageSize: MAX_PAGE_SIZE,
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
    user: { id: 'current-user' },
    session: { activeOrganizationId: CHURCH_ID },
  } as never);
  // A Church Member with no Volunteer profile, e.g. a ChurchAdmin.
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH_ID,
    volunteerId: null,
    hasVolunteerMembership: false,
    autoSelected: false,
  });
});

const operations = [
  { method: 'GET' as const, url: '/api/v1/notifications' },
  { method: 'PATCH' as const, url: `/api/v1/notifications/${NOTIFICATION_ID}` },
  { method: 'POST' as const, url: '/api/v1/notifications/read-all' },
];

function invitation(): Notification {
  return new Notification({
    props: {
      userId: 'current-user',
      churchId: CHURCH_ID,
      sourceOutboxId: NOTIFICATION_ID,
      kind: 'ministry_invitation',
      data: {
        ministryInvitationId: NOTIFICATION_ID,
        ministryId: MINISTRY_ID,
        ministryName: 'Worship',
      },
    },
    id: NOTIFICATION_ID,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
  });
}

describe('Notification routes refusals', () => {
  it.each(
    operations,
  )('$method $url returns 401 without a session', async (op) => {
    mockGetSession.mockResolvedValue(null as never);

    const response = await app.inject(op);

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('UNAUTHORIZED');
  });

  it.each(
    operations,
  )('$method $url returns 403 without Church Membership', async (op) => {
    mockGetSession.mockResolvedValue({
      user: { id: 'current-user' },
      session: { activeOrganizationId: null },
    } as never);
    activeChurchResolver.resolve.mockResolvedValue({ status: 'no_membership' });

    const response = await app.inject(op);

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('FORBIDDEN');
  });

  it.each(
    operations,
  )('$method $url returns 409 until an Active Church is chosen', async (op) => {
    mockGetSession.mockResolvedValue({
      user: { id: 'current-user' },
      session: { activeOrganizationId: null },
    } as never);
    activeChurchResolver.resolve.mockResolvedValue({
      status: 'selection_required',
    });

    const response = await app.inject(op);

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ACTIVE_CHURCH_SELECTION_REQUIRED');
  });

  it('returns 422 for a malformed identifier, cursor or page size', async () => {
    const badRequests = [
      { method: 'PATCH' as const, url: '/api/v1/notifications/not-a-uuid' },
      { method: 'GET' as const, url: '/api/v1/notifications?cursor=garbage' },
      { method: 'GET' as const, url: '/api/v1/notifications?limit=0' },
      {
        method: 'GET' as const,
        url: `/api/v1/notifications?limit=${MAX_PAGE_SIZE + 1}`,
      },
    ];
    for (const request of badRequests) {
      const response = await app.inject(request);
      expect(response.statusCode, request.url).toBe(422);
      expect(response.json().error).toBe('VALIDATION_ERROR');
    }
    expect(notificationManager.list).not.toHaveBeenCalled();
    expect(notificationManager.markRead).not.toHaveBeenCalled();
  });

  it('returns the one generic 404 for a missing, foreign-User or foreign-Church item', async () => {
    notificationManager.markRead.mockRejectedValue(
      new NotFoundError('Notification not found'),
    );

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notifications/${NOTIFICATION_ID}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NOT_FOUND',
      message: m.error_not_found(),
    });
  });

  it('leaves the old Volunteer notification URLs unregistered', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/volunteer/notifications',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('Notification routes for a member without a Volunteer profile', () => {
  it('lists the session owner’s inbox with the whole-inbox unread count', async () => {
    const cursor = encodeNotificationCursor({
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      id: NOTIFICATION_ID,
    });
    notificationManager.list.mockResolvedValue({
      items: [invitation()],
      nextCursor: cursor,
      unreadCount: 7,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/notifications?cursor=${cursor}&limit=5`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          id: NOTIFICATION_ID,
          kind: 'ministry_invitation',
          data: {
            ministryInvitationId: NOTIFICATION_ID,
            ministryId: MINISTRY_ID,
            ministryName: 'Worship',
          },
          createdAt: '2026-07-01T10:00:00.000Z',
        },
      ],
      nextCursor: cursor,
      unreadCount: 7,
    });
    expect(notificationManager.list).toHaveBeenCalledWith({
      userId: 'current-user',
      churchId: CHURCH_ID,
      cursor,
      limit: 5,
    });
  });

  it('marks one read with 200 and all read with 201, owner taken from the session', async () => {
    const one = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notifications/${NOTIFICATION_ID}`,
    });
    const all = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/read-all',
    });

    expect(one.statusCode).toBe(200);
    expect(one.json()).toEqual({ marked: true });
    expect(all.statusCode).toBe(201);
    expect(all.json()).toEqual({ marked: true });
    expect(notificationManager.markRead).toHaveBeenCalledWith({
      userId: 'current-user',
      churchId: CHURCH_ID,
      notificationId: NOTIFICATION_ID,
    });
    expect(notificationManager.markAllRead).toHaveBeenCalledWith({
      userId: 'current-user',
      churchId: CHURCH_ID,
    });
  });
});
