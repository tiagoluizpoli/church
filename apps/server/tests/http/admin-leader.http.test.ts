import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AdminLeaderController } from '../../src/api/controllers/admin-leader-controller';
import { Assignment } from '../../src/domain/entities/assignment';
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

const ministryManager = {
  listByLeader: vi.fn(),
};

const ministryInvitationManager = {
  mint: vi.fn(),
  resend: vi.fn(),
};

const eventManager = {
  getScheduleBuilderData: vi.fn(),
  listEvents: vi.fn(),
  cancelEvent: vi.fn(),
  sendReminder: vi.fn(),
  createSlot: vi.fn(),
  updateSlot: vi.fn(),
  deleteSlot: vi.fn(),
  generateSlots: vi.fn(),
  upsertSlotRequirement: vi.fn(),
};

const assignmentManager = {
  createAssignment: vi.fn(),
  getAssignment: vi.fn(),
  overrideAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  listAuditLog: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

const authorityGuard = {
  canManageMinistry: vi.fn(),
  canManageEvent: vi.fn(),
  canManageEventSlot: vi.fn(),
  canManageShift: vi.fn(),
  hasSchedulingAccess: vi.fn(),
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

beforeAll(async () => {
  app = await createFastify();
  const controller = new AdminLeaderController(
    ministryManager as never,
    ministryInvitationManager as never,
    eventManager as never,
    assignmentManager as never,
    activeChurchResolver as never,
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
    user: { id: 'admin-leader-user' },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue(
    createActiveChurchResolution(),
  );
  authorityGuard.canManageMinistry.mockResolvedValue(true);
  authorityGuard.canManageEvent.mockResolvedValue(true);
  authorityGuard.canManageEventSlot.mockResolvedValue(true);
  authorityGuard.canManageShift.mockResolvedValue(true);
  authorityGuard.hasSchedulingAccess.mockResolvedValue(true);
});

describe('Admin leader controller authorization wiring', () => {
  it('GET /api/v1/admin/ministries is gated by hasSchedulingAccess, not per-Ministry (self-scoped by leaderId)', async () => {
    ministryManager.listByLeader.mockResolvedValue([]);

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ministries',
    });
    expect(allowed.statusCode).toBe(200);
    expect(authorityGuard.canManageMinistry).not.toHaveBeenCalled();

    authorityGuard.hasSchedulingAccess.mockResolvedValueOnce(false);
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ministries',
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Admin or leader role required',
    });
    expect(ministryManager.listByLeader).toHaveBeenCalledTimes(1);
  });

  it('GET /api/v1/admin/schedule-builder stays reachable by any authenticated volunteer (no coarse role gate)', async () => {
    eventManager.getScheduleBuilderData.mockResolvedValue({
      events: [],
      assignments: [],
      availability: [],
      volunteers: [],
      roles: [],
      callerTeamIds: null,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/schedule-builder?eventId=66666666-6666-6666-6666-666666666666',
    });

    expect(response.statusCode).toBe(200);
  });

  it('GET /api/v1/admin/events allows a Ministry leader and denies a non-leader', async () => {
    eventManager.listEvents.mockResolvedValue([]);

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/events?ministryId=22222222-2222-2222-8222-222222222222',
    });
    expect(allowed.statusCode).toBe(200);
    expect(authorityGuard.canManageMinistry).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId: '22222222-2222-2222-8222-222222222222',
      userId: 'admin-leader-user',
    });

    authorityGuard.canManageMinistry.mockResolvedValueOnce(false);
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/events?ministryId=22222222-2222-2222-8222-222222222222',
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Not a leader of this ministry',
    });
  });

  it('a ChurchAdmin with no Volunteer profile is still a valid caller for pure Church-authority routes', async () => {
    activeChurchResolver.resolve.mockResolvedValue({
      ...createActiveChurchResolution(),
      volunteerId: null,
    });
    eventManager.listEvents.mockResolvedValue([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/events?ministryId=22222222-2222-2222-8222-222222222222',
    });
    expect(response.statusCode).toBe(200);
  });

  it('GET /api/v1/admin/ministries and /api/v1/admin/schedule-builder still require a Volunteer profile', async () => {
    activeChurchResolver.resolve.mockResolvedValue({
      ...createActiveChurchResolution(),
      volunteerId: null,
    });

    const ministries = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ministries',
    });
    expect(ministries.statusCode).toBe(401);
    expect(ministries.json()).toEqual({
      error: 'UNAUTHORIZED',
      message: 'Volunteer profile not found',
    });
    expect(ministryManager.listByLeader).not.toHaveBeenCalled();

    const scheduleBuilder = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/schedule-builder?eventId=66666666-6666-6666-6666-666666666666',
    });
    expect(scheduleBuilder.statusCode).toBe(401);
    expect(scheduleBuilder.json()).toEqual({
      error: 'UNAUTHORIZED',
      message: 'Volunteer profile not found',
    });
    expect(eventManager.getScheduleBuilderData).not.toHaveBeenCalled();
  });

  it('POST /api/v1/admin/events/:eventId/cancel authorizes via AuthorityGuard.canManageEvent', async () => {
    const eventId = '66666666-6666-6666-6666-666666666666';

    const allowed = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/events/${eventId}/cancel`,
    });
    expect(allowed.statusCode).toBe(201);
    expect(eventManager.cancelEvent).toHaveBeenCalledTimes(1);
    expect(authorityGuard.canManageEvent).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId,
      userId: 'admin-leader-user',
    });

    authorityGuard.canManageEvent.mockResolvedValueOnce(false);
    const denied = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/events/${eventId}/cancel`,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Not a leader of this event',
    });
    expect(eventManager.cancelEvent).toHaveBeenCalledTimes(1);
  });

  it('POST /api/v1/admin/assignments authorizes via AuthorityGuard.canManageEventSlot', async () => {
    const slotId = '77777777-7777-7777-8777-777777777777';
    assignmentManager.createAssignment.mockResolvedValue(
      new Assignment(
        {
          churchId: '11111111-1111-1111-1111-111111111111',
          slotId,
          volunteerId: 'vol-1',
          roleId: 'role-1',
          status: 'pending',
        },
        'assign-1',
      ),
    );

    const allowed = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/assignments',
      payload: { slotId, volunteerId: 'vol-1', roleId: 'role-1' },
    });
    expect(allowed.statusCode).toBe(201);
    expect(authorityGuard.canManageEventSlot).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      slotId,
      userId: 'admin-leader-user',
    });

    authorityGuard.canManageEventSlot.mockResolvedValueOnce(false);
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/assignments',
      payload: { slotId, volunteerId: 'vol-1', roleId: 'role-1' },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Slot belongs to another ministry',
    });
    expect(assignmentManager.createAssignment).toHaveBeenCalledTimes(1);
  });

  it('DELETE /api/v1/admin/assignments/:assignmentId authorizes via the Assignment Shift scope', async () => {
    const assignmentId = '88888888-8888-8888-8888-888888888888';
    assignmentManager.getAssignment.mockResolvedValue({
      shiftId: '99999999-9999-9999-9999-999999999999',
    });

    const allowed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/assignments/${assignmentId}`,
    });
    expect(allowed.statusCode).toBe(204);
    expect(authorityGuard.canManageShift).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      shiftId: '99999999-9999-9999-9999-999999999999',
      userId: 'admin-leader-user',
    });

    authorityGuard.canManageShift.mockResolvedValueOnce(false);
    const denied = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/assignments/${assignmentId}`,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Assignment belongs to another ministry',
    });
    expect(assignmentManager.deleteAssignment).toHaveBeenCalledTimes(1);
  });

  it('DELETE /api/v1/admin/assignments/:assignmentId denies when the Assignment has no Shift scope', async () => {
    assignmentManager.getAssignment.mockResolvedValue({ shiftId: undefined });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/assignments/88888888-8888-8888-8888-888888888888',
    });

    expect(response.statusCode).toBe(403);
    expect(authorityGuard.canManageShift).not.toHaveBeenCalled();
    expect(assignmentManager.deleteAssignment).not.toHaveBeenCalled();
  });
});

describe('Ministry Invitation minting routes', () => {
  const ministryId = '22222222-2222-2222-8222-222222222222';

  it('POST /api/v1/admin/ministries/:ministryId/invitations mints and maps the response', async () => {
    ministryInvitationManager.mint.mockResolvedValue({
      id: 'ministry-invitation-1',
      kind: 'chained',
      status: 'pending',
      churchInvitationId: 'church-invitation-1',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/ministries/${ministryId}/invitations`,
      payload: {
        email: 'outsider@example.com',
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: 'ministry-invitation-1',
      kind: 'chained',
      status: 'pending',
      expiresAt: '2030-01-01T00:00:00.000Z',
      redemptionPath: '/invitations/church/church-invitation-1',
    });
    expect(ministryInvitationManager.mint).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId,
      inviterId: 'admin-leader-user',
      email: 'outsider@example.com',
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });
  });

  it('POST /api/v1/admin/ministries/:ministryId/invitations rejects a malformed email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/ministries/${ministryId}/invitations`,
      payload: {
        email: 'not-an-email',
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      },
    });

    expect(response.statusCode).toBe(422);
    expect(ministryInvitationManager.mint).not.toHaveBeenCalled();
  });

  it('POST .../invitations/:invitationId/resend refreshes and maps the response', async () => {
    ministryInvitationManager.resend.mockResolvedValue({
      id: 'ministry-invitation-1',
      kind: 'ministry-only',
      status: 'pending',
      expiresAt: new Date('2030-02-01T00:00:00Z'),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/ministries/${ministryId}/invitations/ministry-invitation-1/resend`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 'ministry-invitation-1',
      kind: 'ministry-only',
      status: 'pending',
      expiresAt: '2030-02-01T00:00:00.000Z',
      redemptionPath: '/invitations/ministry/ministry-invitation-1',
    });
    expect(ministryInvitationManager.resend).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId,
      ministryInvitationId: 'ministry-invitation-1',
      callerId: 'admin-leader-user',
    });
  });
});
