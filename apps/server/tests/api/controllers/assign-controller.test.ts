import { appConfig, withAllParkedOn } from '@church/app-config';
import { NotFoundError } from '@church/core';
import { m } from '@church/i18n/messages';
import { parseInstant } from '@church/time';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AssignController } from '@/api/controllers/assign-controller';
import { Assignment } from '@/domain/entities/assignment';
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

const participationManager = {
  listScheduleSummaries: vi.fn(),
  listEligibleVolunteers: vi.fn(),
  getCompletion: vi.fn(),
  getCycleBuilderData: vi.fn(),
  publishCycle: vi.fn(),
};

const assignmentManager = {
  getAssignment: vi.fn(),
  createParticipationAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  reassignParticipationAssignment: vi.fn(),
  listAuditLogForCycle: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

const authorityGuard = {
  canManageParticipation: vi.fn(),
  canManageShift: vi.fn(),
  canManageMinistry: vi.fn(),
  decideManageAnyMinistry: vi.fn(),
  decideManageMinistry: vi.fn(),
  decideManageParticipation: vi.fn(),
  decideManageShift: vi.fn(),
};

let app: FastifyTypedInstance;

async function buildApp(config: typeof appConfig) {
  const instanceApp = await createFastify({ locale: testLocale });
  const controller = new AssignController({
    participationManager: participationManager as never,
    assignmentManager: assignmentManager as never,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: authorityGuard as never,
    config,
  });
  await instanceApp.register(
    async (instance) => {
      instance.register(controller.registerRoutes.bind(controller), {
        prefix: controller.prefix,
      });
    },
    { prefix: '/api/v1' },
  );
  await instanceApp.ready();
  return instanceApp;
}

let parkedOnApp: FastifyTypedInstance;

beforeAll(async () => {
  app = await buildApp(appConfig);
  parkedOnApp = await buildApp(withAllParkedOn(appConfig) as typeof appConfig);
});

afterAll(async () => {
  await app.close();
  await parkedOnApp.close();
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
  authorityGuard.decideManageAnyMinistry.mockResolvedValue({ allowed: true });
  authorityGuard.decideManageMinistry.mockResolvedValue({ allowed: true });
  authorityGuard.decideManageParticipation.mockResolvedValue({ allowed: true });
  authorityGuard.decideManageShift.mockResolvedValue({ allowed: true });
  assignmentManager.getAssignment.mockResolvedValue({
    shiftId: '66666666-6666-6666-8666-666666666666',
  });
});

const ASSIGN_MINISTRY = '55555555-5555-5555-8555-555555555555';
const ASSIGN_CYCLE = '77777777-7777-7777-8777-777777777777';
const ASSIGN_SHIFT = '66666666-6666-6666-8666-666666666666';
const ASSIGN_PARTICIPATION = '22222222-2222-2222-8222-222222222222';
const ASSIGN_ASSIGNMENT = '88888888-8888-8888-8888-888888888888';

interface ScopedAssignRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  decision:
    | 'decideManageMinistry'
    | 'decideManageParticipation'
    | 'decideManageShift';
  payload?: Record<string, unknown>;
  /** Routes addressed by Assignment id: "missing" is an unknown Assignment. */
  byAssignment?: boolean;
}

const scopedAssignRoutes: ScopedAssignRoute[] = [
  {
    method: 'GET',
    url: `/api/v1/assign/cycles/${ASSIGN_CYCLE}/builder?ministryId=${ASSIGN_MINISTRY}`,
    decision: 'decideManageMinistry',
  },
  {
    method: 'POST',
    url: `/api/v1/assign/cycles/${ASSIGN_CYCLE}/publish?ministryId=${ASSIGN_MINISTRY}`,
    decision: 'decideManageMinistry',
    payload: {},
  },
  {
    method: 'GET',
    url: `/api/v1/assign/shifts/${ASSIGN_SHIFT}/eligible-volunteers`,
    decision: 'decideManageShift',
  },
  {
    method: 'POST',
    url: `/api/v1/assign/shifts/${ASSIGN_SHIFT}/assignments`,
    decision: 'decideManageShift',
    payload: {
      volunteerId: 'volunteer-2',
      shiftRequirementId: 'requirement-1',
    },
  },
  {
    method: 'DELETE',
    url: `/api/v1/assign/assignments/${ASSIGN_ASSIGNMENT}`,
    decision: 'decideManageShift',
    byAssignment: true,
  },
  {
    method: 'PATCH',
    url: `/api/v1/assign/assignments/${ASSIGN_ASSIGNMENT}/reassign`,
    decision: 'decideManageShift',
    payload: { volunteerId: 'volunteer-2' },
    byAssignment: true,
  },
  {
    method: 'GET',
    url: `/api/v1/assign/participations/${ASSIGN_PARTICIPATION}/completion`,
    decision: 'decideManageParticipation',
  },
];

function expectNoAssignWork(): void {
  const { getAssignment: _scopeRead, ...assignmentWork } = assignmentManager;
  for (const operation of [
    ...Object.values(participationManager),
    ...Object.values(assignmentWork),
  ]) {
    expect(operation).not.toHaveBeenCalled();
  }
}

describe('Assign route refusals', () => {
  it.each(
    scopedAssignRoutes,
  )('$method $url: missing and hidden objects share one 404', async ({
    method,
    url,
    decision,
    payload,
    byAssignment,
  }) => {
    if (byAssignment) {
      assignmentManager.getAssignment.mockRejectedValueOnce(
        new NotFoundError(`Assignment not found: ${ASSIGN_ASSIGNMENT}`),
      );
    } else {
      authorityGuard[decision].mockResolvedValueOnce({
        allowed: false,
        reason: 'RESOURCE_NOT_FOUND',
      });
    }
    const missing = await app.inject({ method, url, payload });
    authorityGuard[decision].mockResolvedValueOnce({
      allowed: false,
      reason: 'INSUFFICIENT_ACCESS_LEVEL',
    });
    const hidden = await app.inject({ method, url, payload });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: 'NOT_FOUND',
      message: m.error_not_found(),
    });
    expect(hidden).toMatchObject({ statusCode: 404, body: missing.body });
    expectNoAssignWork();
  });

  it.each(
    scopedAssignRoutes,
  )('$method $url: 403 without the scheduling function', async ({
    method,
    url,
    decision,
    payload,
  }) => {
    authorityGuard[decision].mockResolvedValue({
      allowed: false,
      reason: 'INSUFFICIENT_ACCESS_LEVEL',
    });
    authorityGuard.decideManageAnyMinistry.mockResolvedValue({
      allowed: false,
      reason: 'INSUFFICIENT_ACCESS_LEVEL',
    });

    const response = await app.inject({ method, url, payload });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('FORBIDDEN');
    expectNoAssignWork();
  });
});

describe('Assign routes', () => {
  it('returns 401 for any route when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/assign/shifts/66666666-6666-6666-8666-666666666666/eligible-volunteers',
    });

    expect(response.statusCode).toBe(401);
    expect(participationManager.listEligibleVolunteers).not.toHaveBeenCalled();
  });

  it('GET /api/v1/assign/shifts/:id/eligible-volunteers returns ranked volunteers', async () => {
    participationManager.listEligibleVolunteers.mockResolvedValue([
      {
        volunteerId: 'vol-1',
        volunteerName: 'Ada Lovelace',
        isAvailable: true,
        hasConflict: false,
        lastServedAt: parseInstant({ value: '2026-08-01T10:00:00.000Z' }),
        qualifiedRoleIds: ['role-1'],
        ministryAccessLevel: 'volunteer',
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/assign/shifts/66666666-6666-6666-8666-666666666666/eligible-volunteers',
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
        },
      ],
    });
  });

  it('POST /api/v1/assign/shifts/:id/assignments returns 201 with warnings', async () => {
    assignmentManager.createParticipationAssignment.mockResolvedValue({
      assignment: new Assignment({
        props: {
          churchId: '11111111-1111-1111-1111-111111111111',
          eventTimeBlockId: '77777777-7777-7777-8777-777777777777',
          participationId: '22222222-2222-2222-8222-222222222222',
          shiftId: '66666666-6666-6666-8666-666666666666',
          volunteerId: 'vol-1',
          roleId: 'role-1',
          shiftRequirementId: '88888888-8888-8888-8888-888888888888',
          status: 'pending',
        },
        id: 'assign-1',
      }),
      warnings: [
        {
          type: 'NOT_QUALIFIED',
          details: 'Volunteer is not qualified for the requested role',
        },
      ],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assign/shifts/66666666-6666-6666-8666-666666666666/assignments',
      payload: {
        volunteerId: 'vol-1',
        shiftRequirementId: '88888888-8888-8888-8888-888888888888',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(
      assignmentManager.createParticipationAssignment,
    ).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      shiftId: '66666666-6666-6666-8666-666666666666',
      volunteerId: 'vol-1',
      shiftRequirementId: '88888888-8888-8888-8888-888888888888',
      actorId: 'leader-user',
    });
    expect(response.json()).toEqual({
      assignment: {
        id: 'assign-1',
        churchId: '11111111-1111-1111-1111-111111111111',
        eventTimeBlockId: '77777777-7777-7777-8777-777777777777',
        participationId: '22222222-2222-2222-8222-222222222222',
        shiftId: '66666666-6666-6666-8666-666666666666',
        volunteerId: 'vol-1',
        shiftRequirementId: '88888888-8888-8888-8888-888888888888',
        roleId: 'role-1',
        status: 'pending',
        assignedAt: expect.any(String),
      },
      warnings: [
        {
          type: 'NOT_QUALIFIED',
          details: 'Volunteer is not qualified for the requested role',
        },
      ],
    });
  });

  it('rejects a request that combines a ShiftRequirement with caller-supplied Role', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assign/shifts/66666666-6666-6666-8666-666666666666/assignments',
      payload: {
        volunteerId: 'vol-1',
        shiftRequirementId: '88888888-8888-8888-8888-888888888888',
        roleId: 'role-1',
      },
    });

    expect(response.statusCode).toBe(422);
    expect(
      assignmentManager.createParticipationAssignment,
    ).not.toHaveBeenCalled();
  });

  it('rejects the legacy role-only create contract', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assign/shifts/66666666-6666-6666-8666-666666666666/assignments',
      payload: { volunteerId: 'vol-1', roleId: 'role-1' },
    });

    expect(response.statusCode).toBe(422);
    expect(
      assignmentManager.createParticipationAssignment,
    ).not.toHaveBeenCalled();
  });

  it('returns 403 when a Volunteer has no assignment-management function', async () => {
    authorityGuard.decideManageShift.mockResolvedValue({ allowed: false });
    authorityGuard.decideManageAnyMinistry.mockResolvedValue({
      allowed: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assign/shifts/66666666-6666-6666-8666-666666666666/assignments',
      payload: {
        volunteerId: 'vol-1',
        shiftRequirementId: '88888888-8888-8888-8888-888888888888',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'FORBIDDEN',
      message: m.error_forbidden(),
    });
    expect(
      assignmentManager.createParticipationAssignment,
    ).not.toHaveBeenCalled();
  });

  it('returns the same generic 404 for a missing Assignment after function admission', async () => {
    assignmentManager.getAssignment.mockRejectedValueOnce(
      new NotFoundError('Assignment not found'),
    );

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/assign/assignments/forged',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NOT_FOUND',
      message: m.error_not_found(),
    });
    expect(assignmentManager.deleteAssignment).not.toHaveBeenCalled();
  });

  it('POST /api/v1/assign/cycles/:id/publish returns 200 and reports below-full without confirm', async () => {
    const url =
      '/api/v1/assign/cycles/11111111-1111-1111-8111-111111111111/publish?ministryId=22222222-2222-2222-8222-222222222222';
    participationManager.publishCycle.mockResolvedValueOnce({
      published: true,
      belowFull: false,
      participations: [],
    });

    const okResponse = await app.inject({
      method: 'POST',
      url,
      payload: { confirmBelowFull: true },
    });

    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.json()).toEqual({
      published: true,
      belowFull: false,
      participations: [],
    });

    participationManager.publishCycle.mockResolvedValueOnce({
      published: false,
      belowFull: true,
      participations: [],
    });

    const blockedResponse = await app.inject({
      method: 'POST',
      url,
      payload: {},
    });

    expect(blockedResponse.statusCode).toBe(200);
    expect(blockedResponse.json()).toEqual({
      published: false,
      belowFull: true,
      participations: [],
    });
  });

  it('PATCH /api/v1/assign/assignments/:id/reassign returns 200 with the new assignment', async () => {
    assignmentManager.reassignParticipationAssignment.mockResolvedValue(
      new Assignment({
        props: {
          churchId: '11111111-1111-1111-1111-111111111111',
          eventTimeBlockId: '77777777-7777-7777-8777-777777777777',
          participationId: '22222222-2222-2222-8222-222222222222',
          shiftId: '66666666-6666-6666-8666-666666666666',
          volunteerId: 'vol-2',
          roleId: 'role-1',
          shiftRequirementId: '00000000-0000-0000-0000-000000000021' as never,
          status: 'pending',
        },
        id: 'assign-2',
      }),
    );

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/assign/assignments/assign-1/reassign',
      payload: {
        volunteerId: 'vol-2',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 'assign-2',
      churchId: '11111111-1111-1111-1111-111111111111',
      eventTimeBlockId: '77777777-7777-7777-8777-777777777777',
      participationId: '22222222-2222-2222-8222-222222222222',
      shiftId: '66666666-6666-6666-8666-666666666666',
      volunteerId: 'vol-2',
      roleId: 'role-1',
      shiftRequirementId: '00000000-0000-0000-0000-000000000021',
      status: 'pending',
      assignedAt: expect.any(String),
    });
  });

  it('PATCH /api/v1/assign/assignments/:id/reassign returns generic 404 for another ministry scope', async () => {
    authorityGuard.decideManageShift.mockResolvedValue({ allowed: false });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/assign/assignments/assign-1/reassign',
      payload: {
        volunteerId: 'vol-2',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NOT_FOUND',
      message: m.error_not_found(),
    });
    expect(
      assignmentManager.reassignParticipationAssignment,
    ).not.toHaveBeenCalled();
  });

  it('POST /api/v1/assign/shifts/:id/assignments returns generic 404 for another ministry scope', async () => {
    authorityGuard.decideManageShift.mockResolvedValue({ allowed: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assign/shifts/66666666-6666-6666-8666-666666666666/assignments',
      payload: {
        volunteerId: 'vol-1',
        shiftRequirementId: '88888888-8888-8888-8888-888888888888',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NOT_FOUND',
      message: m.error_not_found(),
    });
    expect(
      assignmentManager.createParticipationAssignment,
    ).not.toHaveBeenCalled();
  });

  it('PATCH /api/v1/assign/assignments/:id/reassign returns generic 404 when the Assignment has no Shift scope', async () => {
    assignmentManager.getAssignment.mockResolvedValue({ shiftId: undefined });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/assign/assignments/assign-1/reassign',
      payload: {
        volunteerId: 'vol-2',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(authorityGuard.decideManageShift).not.toHaveBeenCalled();
    expect(
      assignmentManager.reassignParticipationAssignment,
    ).not.toHaveBeenCalled();
  });

  it('GET /api/v1/assign/cycles/:id/builder allows a Ministry leader and denies a non-leader', async () => {
    participationManager.getCycleBuilderData.mockResolvedValue({
      events: [],
      roles: [],
    });

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/v1/assign/cycles/11111111-1111-1111-8111-111111111111/builder?ministryId=22222222-2222-2222-8222-222222222222',
    });
    expect(allowed.statusCode).toBe(200);

    authorityGuard.decideManageMinistry.mockResolvedValueOnce({
      allowed: false,
    });
    authorityGuard.decideManageAnyMinistry.mockResolvedValueOnce({
      allowed: false,
    });
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/assign/cycles/11111111-1111-1111-8111-111111111111/builder?ministryId=22222222-2222-2222-8222-222222222222',
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: m.error_forbidden(),
    });
  });

  it('GET /api/v1/assign/teams/:id/cycles-summary is gone (404)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/assign/teams/33333333-3333-4333-8333-333333333333/cycles-summary?ministryId=22222222-2222-2222-8222-222222222222',
    });

    expect(response.statusCode).toBe(404);
  });

  it('GET /api/v1/assign/cycles/:id/builder denies a TeamLeader as a plain Volunteer and ignores teamId', async () => {
    authorityGuard.decideManageMinistry.mockResolvedValue({ allowed: false });
    authorityGuard.decideManageAnyMinistry.mockResolvedValue({
      allowed: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/assign/cycles/11111111-1111-1111-8111-111111111111/builder?ministryId=22222222-2222-2222-8222-222222222222&teamId=33333333-3333-4333-8333-333333333333',
    });

    expect(response.statusCode).toBe(403);
    expect(participationManager.getCycleBuilderData).not.toHaveBeenCalled();
  });

  it('returns the same generic 404 for hidden Shift and missing Assignment resources', async () => {
    authorityGuard.decideManageShift.mockResolvedValueOnce({ allowed: false });
    const hiddenShift = await app.inject({
      method: 'GET',
      url: '/api/v1/assign/shifts/66666666-6666-6666-8666-666666666666/eligible-volunteers',
    });

    assignmentManager.getAssignment.mockRejectedValueOnce(
      new NotFoundError('Assignment not found'),
    );
    const missingAssignment = await app.inject({
      method: 'DELETE',
      url: '/api/v1/assign/assignments/forged',
    });

    expect(hiddenShift.statusCode).toBe(404);
    expect(hiddenShift.json()).toEqual(missingAssignment.json());
    expect(participationManager.listEligibleVolunteers).not.toHaveBeenCalled();
    expect(assignmentManager.deleteAssignment).not.toHaveBeenCalled();
  });

  it('GET /api/v1/assign/cycles/:id/audit is 404 while the audit panel is parked', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/assign/cycles/11111111-1111-1111-8111-111111111111/audit?ministryId=22222222-2222-2222-8222-222222222222',
    });
    expect(response.statusCode).toBe(404);
    expect(assignmentManager.listAuditLogForCycle).not.toHaveBeenCalled();
  });

  it('GET /api/v1/assign/cycles/:id/audit (auditPanel on) allows a Ministry leader and denies a non-leader', async () => {
    assignmentManager.listAuditLogForCycle.mockResolvedValue([]);

    const allowed = await parkedOnApp.inject({
      method: 'GET',
      url: '/api/v1/assign/cycles/11111111-1111-1111-8111-111111111111/audit?ministryId=22222222-2222-2222-8222-222222222222',
    });
    expect(allowed.statusCode).toBe(200);
    expect(assignmentManager.listAuditLogForCycle).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      cycleId: '11111111-1111-1111-8111-111111111111',
      ministryId: '22222222-2222-2222-8222-222222222222',
    });

    authorityGuard.decideManageMinistry.mockResolvedValueOnce({
      allowed: false,
    });
    authorityGuard.decideManageAnyMinistry.mockResolvedValueOnce({
      allowed: false,
    });
    const denied = await parkedOnApp.inject({
      method: 'GET',
      url: '/api/v1/assign/cycles/11111111-1111-1111-8111-111111111111/audit?ministryId=22222222-2222-2222-8222-222222222222',
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: m.error_forbidden(),
    });
  });

  it('POST /api/v1/assign/cycles/:id/publish denies a non-leader of the ministry', async () => {
    authorityGuard.decideManageMinistry.mockResolvedValueOnce({
      allowed: false,
    });
    authorityGuard.decideManageAnyMinistry.mockResolvedValueOnce({
      allowed: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assign/cycles/11111111-1111-1111-8111-111111111111/publish?ministryId=22222222-2222-2222-8222-222222222222',
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'FORBIDDEN',
      message: m.error_forbidden(),
    });
    expect(participationManager.publishCycle).not.toHaveBeenCalled();
  });

  it('POST /api/v1/assign/participations/:id/publish is gone (404)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assign/participations/11111111-1111-1111-8111-111111111111/publish',
      payload: {},
    });

    expect(response.statusCode).toBe(404);
  });
});
