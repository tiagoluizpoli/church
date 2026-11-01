import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CallerCapabilitiesController } from '@/api/controllers/caller-capabilities-controller';
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

const activeChurchResolver = { resolve: vi.fn() };
const authorityGuard = { resolveCallerCapabilities: vi.fn() };

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const controller = new CallerCapabilitiesController({
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: authorityGuard as never,
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
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: '11111111-1111-4111-8111-111111111111',
    volunteerId: null,
    autoSelected: false,
  });
});

describe('Caller capabilities controller', () => {
  it('returns all Active-Church capacities for an admin without a Volunteer profile', async () => {
    authorityGuard.resolveCallerCapabilities.mockResolvedValue({
      churchId: '11111111-1111-4111-8111-111111111111',
      isChurchAdmin: true,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/caller-capabilities',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      churchId: '11111111-1111-4111-8111-111111111111',
      isChurchAdmin: true,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });
    expect(authorityGuard.resolveCallerCapabilities).toHaveBeenCalledWith({
      churchId: '11111111-1111-4111-8111-111111111111',
      userId: 'current-user',
    });
  });

  it('returns empty capacities for a plain Church Member', async () => {
    authorityGuard.resolveCallerCapabilities.mockResolvedValue({
      churchId: '11111111-1111-4111-8111-111111111111',
      isChurchAdmin: false,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/caller-capabilities',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      churchId: '11111111-1111-4111-8111-111111111111',
      isChurchAdmin: false,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });
  });

  it('retains actual leadership alongside serving capacity', async () => {
    authorityGuard.resolveCallerCapabilities.mockResolvedValue({
      churchId: '11111111-1111-4111-8111-111111111111',
      isChurchAdmin: false,
      ledMinistries: [
        { ministryId: '22222222-2222-4222-8222-222222222222', name: 'Worship' },
      ],
      hasVolunteerMembership: true,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/caller-capabilities',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      churchId: '11111111-1111-4111-8111-111111111111',
      isChurchAdmin: false,
      ledMinistries: [
        { ministryId: '22222222-2222-4222-8222-222222222222', name: 'Worship' },
      ],
      hasVolunteerMembership: true,
    });
  });
});
