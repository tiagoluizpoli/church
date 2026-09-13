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
import { createFastify } from '../../main/fastify/setup';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { AssignmentController } from './assignment-controller';

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
  canManageEventSlot: vi.fn(),
  canManageShift: vi.fn(),
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
  const controller = new AssignmentController(
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
  authorityGuard.canManageEventSlot.mockResolvedValue(true);
  authorityGuard.canManageShift.mockResolvedValue(true);
});

describe('Assignment controller authorization wiring', () => {
  it('returns 401 for any route when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assignments',
      payload: { slotId: 'slot-1', volunteerId: 'vol-1', roleId: 'role-1' },
    });

    expect(response.statusCode).toBe(401);
    expect(assignmentManager.createAssignment).not.toHaveBeenCalled();
  });

  it('POST /api/v1/assignments authorizes via AuthorityGuard.canManageEventSlot', async () => {
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
      url: '/api/v1/assignments',
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
      url: '/api/v1/assignments',
      payload: { slotId, volunteerId: 'vol-1', roleId: 'role-1' },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Slot belongs to another ministry',
    });
    expect(assignmentManager.createAssignment).toHaveBeenCalledTimes(1);
  });

  it('DELETE /api/v1/assignments/:assignmentId authorizes via the Assignment Shift scope', async () => {
    const assignmentId = '88888888-8888-8888-8888-888888888888';
    assignmentManager.getAssignment.mockResolvedValue({
      shiftId: '99999999-9999-9999-9999-999999999999',
    });

    const allowed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assignments/${assignmentId}`,
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
      url: `/api/v1/assignments/${assignmentId}`,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Assignment belongs to another ministry',
    });
    expect(assignmentManager.deleteAssignment).toHaveBeenCalledTimes(1);
  });

  it('DELETE /api/v1/assignments/:assignmentId denies when the Assignment has no Shift scope', async () => {
    assignmentManager.getAssignment.mockResolvedValue({ shiftId: undefined });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/assignments/88888888-8888-8888-8888-888888888888',
    });

    expect(response.statusCode).toBe(403);
    expect(authorityGuard.canManageShift).not.toHaveBeenCalled();
    expect(assignmentManager.deleteAssignment).not.toHaveBeenCalled();
  });

  it('GET /api/v1/assignments/:assignmentId/audit authorizes via the Assignment Shift scope', async () => {
    const assignmentId = '88888888-8888-8888-8888-888888888888';
    assignmentManager.getAssignment.mockResolvedValue({
      shiftId: '99999999-9999-9999-9999-999999999999',
    });
    assignmentManager.listAuditLog.mockResolvedValue([]);

    authorityGuard.canManageShift.mockResolvedValueOnce(false);
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/assignments/${assignmentId}/audit`,
    });
    expect(denied.statusCode).toBe(403);

    const allowed = await app.inject({
      method: 'GET',
      url: `/api/v1/assignments/${assignmentId}/audit`,
    });
    expect(allowed.statusCode).toBe(200);
  });
});
