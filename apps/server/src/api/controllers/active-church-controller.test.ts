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
import { ActiveChurchController } from './active-church-controller';

vi.mock('@church/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
      setActiveOrganization: vi.fn(),
    },
  },
}));

const mockGetSession = vi.mocked(
  (await import('@church/auth')).auth.api.getSession,
);
const mockSetActiveOrganization = vi.mocked(
  (await import('@church/auth')).auth.api.setActiveOrganization,
);

const activeChurchResolver = { resolve: vi.fn() };
const selectionManager = {
  listSelectableChurches: vi.fn(),
  selectActiveChurch: vi.fn(),
};

let app: FastifyTypedInstance;

const CHURCH_ID = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  app = await createFastify();
  const controller = new ActiveChurchController(
    activeChurchResolver as never,
    selectionManager as never,
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
});

describe('GET /api/v1/active-church/status', () => {
  it('returns 401 when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/active-church/status',
    });

    expect(response.statusCode).toBe(401);
    expect(activeChurchResolver.resolve).not.toHaveBeenCalled();
  });

  it('surfaces "resolved" with the churchId', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: CHURCH_ID },
    } as never);
    activeChurchResolver.resolve.mockResolvedValueOnce({
      status: 'resolved',
      churchId: CHURCH_ID,
      volunteerId: null,
      autoSelected: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/active-church/status',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'resolved',
      churchId: CHURCH_ID,
    });
  });

  it('surfaces "selection_required" without a churchId', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: null },
    } as never);
    activeChurchResolver.resolve.mockResolvedValueOnce({
      status: 'selection_required',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/active-church/status',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'selection_required' });
  });

  it('surfaces "no_membership"', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: null },
    } as never);
    activeChurchResolver.resolve.mockResolvedValueOnce({
      status: 'no_membership',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/active-church/status',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'no_membership' });
  });

  it('surfaces the former Church name when the resolution carries a removal notice, and clears the stale session organization', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: CHURCH_ID },
    } as never);
    activeChurchResolver.resolve.mockResolvedValueOnce({
      status: 'selection_required',
      membershipRemovedFrom: 'Former Home Church',
    });
    mockSetActiveOrganization.mockResolvedValueOnce(undefined as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/active-church/status',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'selection_required',
      membershipRemovedFrom: 'Former Home Church',
    });
    expect(mockSetActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: null } }),
    );
  });

  it('persists a silent auto-select back onto the session', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: null },
    } as never);
    activeChurchResolver.resolve.mockResolvedValueOnce({
      status: 'resolved',
      churchId: CHURCH_ID,
      volunteerId: null,
      autoSelected: true,
    });
    mockSetActiveOrganization.mockResolvedValueOnce(undefined as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/active-church/status',
    });

    expect(response.statusCode).toBe(200);
    expect(mockSetActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: CHURCH_ID } }),
    );
  });
});

describe('GET /api/v1/active-church/options', () => {
  it('returns 401 when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/active-church/options',
    });

    expect(response.statusCode).toBe(401);
    expect(selectionManager.listSelectableChurches).not.toHaveBeenCalled();
  });

  it('lists the selectable Churches for the session user', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: null },
    } as never);
    selectionManager.listSelectableChurches.mockResolvedValueOnce([
      {
        churchId: CHURCH_ID,
        name: 'Igreja Central',
        timezone: 'America/Sao_Paulo',
        accessLevel: 'admin',
        availableAreas: ['dashboard', 'scheduling'],
        lastOpenedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
      {
        churchId: 'church-never-opened',
        name: 'Comunidade Esperança',
        timezone: 'UTC',
        accessLevel: 'member',
        availableAreas: ['dashboard'],
        lastOpenedAt: null,
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/active-church/options',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      churches: [
        {
          churchId: CHURCH_ID,
          name: 'Igreja Central',
          timezone: 'America/Sao_Paulo',
          accessLevel: 'admin',
          availableAreas: ['dashboard', 'scheduling'],
          lastOpenedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          churchId: 'church-never-opened',
          name: 'Comunidade Esperança',
          timezone: 'UTC',
          accessLevel: 'member',
          availableAreas: ['dashboard'],
          lastOpenedAt: null,
        },
      ],
    });
    expect(selectionManager.listSelectableChurches).toHaveBeenCalledWith({
      userId: 'usr_1',
    });
  });
});

describe('POST /api/v1/active-church/select', () => {
  it('returns 401 when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/active-church/select',
      payload: { churchId: CHURCH_ID },
    });

    expect(response.statusCode).toBe(401);
    expect(selectionManager.selectActiveChurch).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller has no Membership in the target Church', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: null },
    } as never);
    selectionManager.selectActiveChurch.mockResolvedValueOnce({
      status: 'no_membership',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/active-church/select',
      payload: { churchId: CHURCH_ID },
    });

    expect(response.statusCode).toBe(403);
    expect(mockSetActiveOrganization).not.toHaveBeenCalled();
  });

  it('persists the selection onto the session and returns "resolved"', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: null },
    } as never);
    selectionManager.selectActiveChurch.mockResolvedValueOnce({
      status: 'resolved',
      churchId: CHURCH_ID,
      volunteerId: null,
      autoSelected: false,
    });
    mockSetActiveOrganization.mockResolvedValueOnce(undefined as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/active-church/select',
      payload: { churchId: CHURCH_ID },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'resolved',
      churchId: CHURCH_ID,
    });
    expect(selectionManager.selectActiveChurch).toHaveBeenCalledWith({
      userId: 'usr_1',
      churchId: CHURCH_ID,
    });
    expect(mockSetActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: CHURCH_ID } }),
    );
  });
});
