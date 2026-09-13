import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Assignment } from '../../domain/entities/assignment';
import { BelowFullPublishError } from '../../domain/errors/below-full-publish';
import { createFastify } from '../../main/fastify/setup';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { RosteringController } from './rostering-controller';

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

const participationManager = {
  listEligibleVolunteers: vi.fn(),
  getCompletion: vi.fn(),
  publish: vi.fn(),
  getCycleBuilderData: vi.fn(),
  publishCycle: vi.fn(),
};

const assignmentManager = {
  getAssignment: vi.fn(),
  createParticipationAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  reassignParticipationAssignment: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

const authorityGuard = {
  canManageParticipation: vi.fn(),
  canManageShift: vi.fn(),
  canManageMinistry: vi.fn(),
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify();
  const controller = new RosteringController(
    participationManager as never,
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
    user: { id: 'leader-user' },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: '11111111-1111-1111-1111-111111111111',
    volunteerId: '44444444-4444-4444-8444-444444444444',
    autoSelected: false,
  });
  authorityGuard.canManageParticipation.mockResolvedValue(true);
  authorityGuard.canManageShift.mockResolvedValue(true);
  authorityGuard.canManageMinistry.mockResolvedValue(true);
  assignmentManager.getAssignment.mockResolvedValue({
    shiftId: '66666666-6666-6666-8666-666666666666',
  });
});

describe('Rostering routes', () => {
  it('returns 401 for any route when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/rostering/shifts/66666666-6666-6666-8666-666666666666/eligible-volunteers',
    });

    expect(response.statusCode).toBe(401);
    expect(participationManager.listEligibleVolunteers).not.toHaveBeenCalled();
  });

  it('GET /api/v1/rostering/shifts/:id/eligible-volunteers returns ranked volunteers', async () => {
    participationManager.listEligibleVolunteers.mockResolvedValue([
      {
        volunteerId: 'vol-1',
        volunteerName: 'Ada Lovelace',
        isAvailable: true,
        hasConflict: false,
        lastServedAt: new Date('2026-08-01T10:00:00.000Z'),
        qualifiedRoleIds: ['role-1'],
        ministryAccessLevel: 'volunteer',
        leadTeamIds: [],
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/rostering/shifts/66666666-6666-6666-8666-666666666666/eligible-volunteers',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      volunteers: [
        {
          volunteerId: 'vol-1',
          volunteerName: 'Ada Lovelace',
          isAvailable: true,
          hasConflict: false,
          lastServedAt: '2026-08-01T10:00:00.000Z',
          qualifiedRoleIds: ['role-1'],
          ministryAccessLevel: 'volunteer',
          leadTeamIds: [],
        },
      ],
    });
  });

  it('POST /api/v1/rostering/shifts/:id/assignments returns 201 with warnings', async () => {
    assignmentManager.createParticipationAssignment.mockResolvedValue({
      assignment: new Assignment(
        {
          churchId: '11111111-1111-1111-1111-111111111111',
          slotId: '77777777-7777-7777-8777-777777777777',
          participationId: '22222222-2222-2222-8222-222222222222',
          shiftId: '66666666-6666-6666-8666-666666666666',
          volunteerId: 'vol-1',
          roleId: 'role-1',
          status: 'pending',
        },
        'assign-1',
      ),
      warnings: [
        {
          type: 'DOUBLE_BOOKED',
          details: 'Volunteer is already assigned to another overlapping shift',
          conflictingId: 'assign-0',
        },
      ],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/rostering/shifts/66666666-6666-6666-8666-666666666666/assignments',
      payload: {
        volunteerId: 'vol-1',
        roleId: 'role-1',
        override: { reason: 'Leader approved overlap' },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      assignment: {
        id: 'assign-1',
        churchId: '11111111-1111-1111-1111-111111111111',
        slotId: '77777777-7777-7777-8777-777777777777',
        participationId: '22222222-2222-2222-8222-222222222222',
        shiftId: '66666666-6666-6666-8666-666666666666',
        volunteerId: 'vol-1',
        roleId: 'role-1',
        status: 'pending',
        assignedAt: expect.any(String),
      },
      warnings: [
        {
          type: 'DOUBLE_BOOKED',
          details: 'Volunteer is already assigned to another overlapping shift',
          conflictingId: 'assign-0',
        },
      ],
    });
  });

  it('POST /api/v1/rostering/participations/:id/publish returns 204 and 409 below-full without confirm', async () => {
    const okResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/rostering/participations/22222222-2222-2222-8222-222222222222/publish',
      payload: { confirmBelowFull: true },
    });

    expect(okResponse.statusCode).toBe(204);

    participationManager.publish.mockRejectedValueOnce(
      new BelowFullPublishError(),
    );

    const blockedResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/rostering/participations/22222222-2222-2222-8222-222222222222/publish',
      payload: {},
    });

    expect(blockedResponse.statusCode).toBe(409);
    expect(blockedResponse.json()).toEqual({
      error: 'BELOW_FULL_PUBLISH',
      message: 'Publishing below full staffing requires confirmation',
    });
  });

  it('PATCH /api/v1/rostering/assignments/:id/reassign returns 200 with the new assignment', async () => {
    assignmentManager.reassignParticipationAssignment.mockResolvedValue(
      new Assignment(
        {
          churchId: '11111111-1111-1111-1111-111111111111',
          slotId: '77777777-7777-7777-8777-777777777777',
          participationId: '22222222-2222-2222-8222-222222222222',
          shiftId: '66666666-6666-6666-8666-666666666666',
          volunteerId: 'vol-2',
          roleId: 'role-1',
          status: 'pending',
        },
        'assign-2',
      ),
    );

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/rostering/assignments/assign-1/reassign',
      payload: {
        volunteerId: 'vol-2',
        reason: 'Original volunteer became unavailable',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 'assign-2',
      churchId: '11111111-1111-1111-1111-111111111111',
      slotId: '77777777-7777-7777-8777-777777777777',
      participationId: '22222222-2222-2222-8222-222222222222',
      shiftId: '66666666-6666-6666-8666-666666666666',
      volunteerId: 'vol-2',
      roleId: 'role-1',
      status: 'pending',
      assignedAt: expect.any(String),
    });
  });

  it('PATCH /api/v1/rostering/assignments/:id/reassign returns 403 for another ministry scope', async () => {
    authorityGuard.canManageShift.mockResolvedValue(false);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/rostering/assignments/assign-1/reassign',
      payload: {
        volunteerId: 'vol-2',
        reason: 'Original volunteer became unavailable',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Shift belongs to another ministry',
    });
    expect(
      assignmentManager.reassignParticipationAssignment,
    ).not.toHaveBeenCalled();
  });

  it('POST /api/v1/rostering/shifts/:id/assignments returns 403 for another ministry scope', async () => {
    authorityGuard.canManageShift.mockResolvedValue(false);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/rostering/shifts/66666666-6666-6666-8666-666666666666/assignments',
      payload: {
        volunteerId: 'vol-1',
        roleId: 'role-1',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Shift belongs to another ministry',
    });
    expect(
      assignmentManager.createParticipationAssignment,
    ).not.toHaveBeenCalled();
  });

  it('PATCH /api/v1/rostering/assignments/:id/reassign denies when the Assignment has no Shift scope', async () => {
    assignmentManager.getAssignment.mockResolvedValue({ shiftId: undefined });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/rostering/assignments/assign-1/reassign',
      payload: {
        volunteerId: 'vol-2',
        reason: 'Original volunteer became unavailable',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(authorityGuard.canManageShift).not.toHaveBeenCalled();
    expect(
      assignmentManager.reassignParticipationAssignment,
    ).not.toHaveBeenCalled();
  });

  it('GET /api/v1/rostering/cycles/:id/builder allows a Ministry leader and denies a non-leader', async () => {
    participationManager.getCycleBuilderData.mockResolvedValue({
      events: [],
      roles: [],
    });

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/v1/rostering/cycles/11111111-1111-1111-8111-111111111111/builder?ministryId=22222222-2222-2222-8222-222222222222',
    });
    expect(allowed.statusCode).toBe(200);

    authorityGuard.canManageMinistry.mockResolvedValueOnce(false);
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/rostering/cycles/11111111-1111-1111-8111-111111111111/builder?ministryId=22222222-2222-2222-8222-222222222222',
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Not a leader of this ministry',
    });
  });

  it('POST /api/v1/rostering/cycles/:id/publish denies a non-leader of the ministry', async () => {
    authorityGuard.canManageMinistry.mockResolvedValueOnce(false);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/rostering/cycles/11111111-1111-1111-8111-111111111111/publish?ministryId=22222222-2222-2222-8222-222222222222',
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Not a leader of this ministry',
    });
    expect(participationManager.publishCycle).not.toHaveBeenCalled();
  });
});
