import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { VolunteerScheduleController } from '../../src/api/controllers/volunteer-schedule-controller';
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

const volunteerManager = {
  getPublishedSchedule: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify();
  const controller = new VolunteerScheduleController(
    volunteerManager as never,
    activeChurchResolver as never,
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

describe('Volunteer published schedule route', () => {
  it('GET /api/v1/volunteer/schedule returns only published assignments', async () => {
    volunteerManager.getPublishedSchedule.mockResolvedValue([
      new Assignment(
        {
          churchId: '11111111-1111-1111-1111-111111111111',
          slotId: '77777777-7777-7777-8777-777777777777',
          participationId: '22222222-2222-2222-8222-222222222222',
          shiftId: '66666666-6666-6666-8666-666666666666',
          volunteerId: '44444444-4444-4444-8444-444444444444',
          roleId: 'role-1',
          status: 'confirmed',
        },
        'assign-1',
      ),
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/volunteer/schedule',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      assignments: [
        {
          id: 'assign-1',
          churchId: '11111111-1111-1111-1111-111111111111',
          slotId: '77777777-7777-7777-8777-777777777777',
          participationId: '22222222-2222-2222-8222-222222222222',
          shiftId: '66666666-6666-6666-8666-666666666666',
          volunteerId: '44444444-4444-4444-8444-444444444444',
          roleId: 'role-1',
          status: 'confirmed',
          assignedAt: expect.any(String),
        },
      ],
    });
  });
});
