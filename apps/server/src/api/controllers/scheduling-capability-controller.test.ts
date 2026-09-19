import 'reflect-metadata';
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
import { SchedulingCapabilityController } from './scheduling-capability-controller';

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

const activeChurchResolver = { resolve: vi.fn() };
const authorityGuard = { resolveSchedulingCapability: vi.fn() };

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify();
  const controller = new SchedulingCapabilityController(
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
    user: { id: 'current-user' },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: '11111111-1111-1111-1111-111111111111',
    volunteerId: null,
    autoSelected: false,
  });
});

describe('Scheduling capability controller', () => {
  it('returns the Active-Church capability projection for a ChurchAdmin without a Volunteer profile', async () => {
    authorityGuard.resolveSchedulingCapability.mockResolvedValue({
      canAccessScheduling: true,
      entries: [{ kind: 'church' }],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/scheduling/capability',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      canAccessScheduling: true,
      entries: [{ kind: 'church' }],
    });
    expect(authorityGuard.resolveSchedulingCapability).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      userId: 'current-user',
    });
  });

  it('returns an explicit denial projection for a Volunteer without Scheduling authority', async () => {
    activeChurchResolver.resolve.mockResolvedValueOnce({
      status: 'resolved',
      churchId: '11111111-1111-1111-1111-111111111111',
      volunteerId: '22222222-2222-2222-8222-222222222222',
      autoSelected: false,
    });
    authorityGuard.resolveSchedulingCapability.mockResolvedValue({
      canAccessScheduling: false,
      entries: [],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/scheduling/capability',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      canAccessScheduling: false,
      entries: [],
    });
  });

  it('returns only the led Ministry entries from the capability projection', async () => {
    authorityGuard.resolveSchedulingCapability.mockResolvedValue({
      canAccessScheduling: true,
      entries: [
        {
          kind: 'ministry',
          ministryId: '22222222-2222-4222-8222-222222222222',
          name: 'Worship',
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/scheduling/capability',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      canAccessScheduling: true,
      entries: [
        {
          kind: 'ministry',
          ministryId: '22222222-2222-4222-8222-222222222222',
          name: 'Worship',
        },
      ],
    });
  });
});
