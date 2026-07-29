import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { LeaderRosteringController } from '../../src/api/controllers/leader-rostering-controller';
import { Assignment } from '../../src/domain/entities/assignment';
import { BelowFullPublishError } from '../../src/domain/errors/below-full-publish';
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

const participationManager = {
  listEligibleVolunteers: vi.fn(),
  getCompletion: vi.fn(),
  publish: vi.fn(),
};

const assignmentManager = {
  getAssignment: vi.fn(),
  createParticipationAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  reassignParticipationAssignment: vi.fn(),
};

const volunteerManager = {
  resolveVolunteerContext: vi.fn(),
};

const rbacGuard = {
  canManageParticipation: vi.fn(),
  canManageShift: vi.fn(),
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify();
  const controller = new LeaderRosteringController(
    participationManager as never,
    assignmentManager as never,
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
  volunteerManager.resolveVolunteerContext.mockResolvedValue({
    churchId: '11111111-1111-1111-1111-111111111111',
    volunteerId: '44444444-4444-4444-8444-444444444444',
    isAdmin: false,
    isLeader: true,
  });
  rbacGuard.canManageParticipation.mockResolvedValue(true);
  rbacGuard.canManageShift.mockResolvedValue(true);
  assignmentManager.getAssignment.mockResolvedValue({
    shiftId: '66666666-6666-6666-8666-666666666666',
  });
});

describe('Leader rostering routes', () => {
  it('GET /api/v1/leader/shifts/:id/eligible-volunteers returns ranked volunteers', async () => {
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
      url: '/api/v1/leader/shifts/66666666-6666-6666-8666-666666666666/eligible-volunteers',
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

  it('POST /api/v1/leader/shifts/:id/assignments returns 201 with warnings', async () => {
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
      url: '/api/v1/leader/shifts/66666666-6666-6666-8666-666666666666/assignments',
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

  it('POST /api/v1/leader/participations/:id/publish returns 204 and 409 below-full without confirm', async () => {
    const okResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/leader/participations/22222222-2222-2222-8222-222222222222/publish',
      payload: { confirmBelowFull: true },
    });

    expect(okResponse.statusCode).toBe(204);

    participationManager.publish.mockRejectedValueOnce(
      new BelowFullPublishError(),
    );

    const blockedResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/leader/participations/22222222-2222-2222-8222-222222222222/publish',
      payload: {},
    });

    expect(blockedResponse.statusCode).toBe(409);
    expect(blockedResponse.json()).toEqual({
      error: 'BELOW_FULL_PUBLISH',
      message: 'Publishing below full staffing requires confirmation',
    });
  });

  it('PATCH /api/v1/leader/assignments/:id/reassign returns 200 with the new assignment', async () => {
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
      url: '/api/v1/leader/assignments/assign-1/reassign',
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

  it('PATCH /api/v1/leader/assignments/:id/reassign returns 403 for another ministry scope', async () => {
    rbacGuard.canManageShift.mockResolvedValue(false);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/leader/assignments/assign-1/reassign',
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

  it('POST /api/v1/leader/shifts/:id/assignments returns 403 for another ministry scope', async () => {
    rbacGuard.canManageShift.mockResolvedValue(false);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/leader/shifts/66666666-6666-6666-8666-666666666666/assignments',
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

  it('PATCH /api/v1/leader/assignments/:id/reassign denies when the Assignment has no Shift scope', async () => {
    assignmentManager.getAssignment.mockResolvedValue({ shiftId: undefined });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/leader/assignments/assign-1/reassign',
      payload: {
        volunteerId: 'vol-2',
        reason: 'Original volunteer became unavailable',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(rbacGuard.canManageShift).not.toHaveBeenCalled();
    expect(
      assignmentManager.reassignParticipationAssignment,
    ).not.toHaveBeenCalled();
  });
});
