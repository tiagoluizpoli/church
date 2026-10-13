import { appConfig, withAllParkedOn } from '@church/app-config';
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
import { AssignmentAccessDeniedError } from '../../src/domain/errors/assignment-access-denied';
import { CancelWindowClosedError } from '../../src/domain/errors/cancel-window-closed';
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
  cancelOwnAssignment: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify();
  const controller = new VolunteerController(
    volunteerManager as never,
    activeChurchResolver as never,
    withAllParkedOn(appConfig) as never,
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
    user: { id: 'vol-user' },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: '11111111-1111-1111-1111-111111111111',
    volunteerId: '44444444-4444-4444-8444-444444444444',
    autoSelected: false,
  });
});

describe('DL3-HT-10 volunteer cancels own assignment', () => {
  it('POST /api/v1/volunteer/assignments/:id/cancel returns 204 for the owning volunteer', async () => {
    volunteerManager.cancelOwnAssignment.mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/volunteer/assignments/66666666-6666-6666-8666-666666666666/cancel',
    });

    expect(response.statusCode).toBe(204);
    expect(volunteerManager.cancelOwnAssignment).toHaveBeenCalledWith({
      assignmentId: '66666666-6666-6666-8666-666666666666',
      volunteerId: '44444444-4444-4444-8444-444444444444',
      churchId: '11111111-1111-1111-1111-111111111111',
    });
  });

  it("POST /api/v1/volunteer/assignments/:id/cancel returns 403 for another volunteer's assignment", async () => {
    volunteerManager.cancelOwnAssignment.mockRejectedValue(
      new AssignmentAccessDeniedError(),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/volunteer/assignments/66666666-6666-6666-8666-666666666666/cancel',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'ASSIGNMENT_ACCESS_DENIED',
      message: 'This assignment belongs to another volunteer',
    });
  });

  it('POST /api/v1/volunteer/assignments/:id/cancel returns 409 CANCEL_WINDOW_CLOSED inside the lead time', async () => {
    volunteerManager.cancelOwnAssignment.mockRejectedValue(
      new CancelWindowClosedError(),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/volunteer/assignments/66666666-6666-6666-8666-666666666666/cancel',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'CANCEL_WINDOW_CLOSED' });
  });
});
