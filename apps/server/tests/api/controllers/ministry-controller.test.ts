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
import { MinistryController } from '@/api/controllers/ministry-controller';
import { MinistryInvitationNotFoundError } from '@/domain/errors/ministry-invitation-not-found';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';

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
  listByChurch: vi.fn(),
  listByLeader: vi.fn(),
};

const ministryInvitationManager = {
  mint: vi.fn(),
  resend: vi.fn(),
  getDeliveryStatus: vi.fn(),
};

const activeChurchResolver = {
  resolve: vi.fn(),
};

const authorityGuard = {
  resolveCallerCapabilities: vi.fn(),
  decideManageAnyMinistry: vi.fn(),
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
  const controller = new MinistryController({
    ministryManager: ministryManager as never,
    ministryInvitationManager: ministryInvitationManager as never,
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
    user: { id: 'admin-leader-user' },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue(
    createActiveChurchResolution(),
  );
  authorityGuard.resolveCallerCapabilities.mockResolvedValue({
    churchId: '11111111-1111-1111-1111-111111111111',
    isChurchAdmin: false,
    ledMinistries: [{ ministryId: 'ministry-1', name: 'Worship' }],
    hasVolunteerMembership: true,
  });
  authorityGuard.decideManageAnyMinistry.mockResolvedValue({ allowed: true });
});

describe('Ministry controller authorization wiring', () => {
  it('returns 401 for any route when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ministries',
    });

    expect(response.statusCode).toBe(401);
    expect(ministryManager.listByLeader).not.toHaveBeenCalled();
  });

  it('GET /api/v1/ministries returns led Ministries for a leader and every Ministry for an admin', async () => {
    ministryManager.listByLeader.mockResolvedValue([]);

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/v1/ministries',
    });
    expect(allowed.statusCode).toBe(200);

    authorityGuard.resolveCallerCapabilities.mockResolvedValueOnce({
      churchId: '11111111-1111-1111-1111-111111111111',
      isChurchAdmin: true,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });
    ministryManager.listByChurch.mockResolvedValueOnce([]);
    const admin = await app.inject({
      method: 'GET',
      url: '/api/v1/ministries',
    });
    expect(admin.statusCode).toBe(200);
    expect(ministryManager.listByChurch).toHaveBeenCalledTimes(1);
    expect(ministryManager.listByLeader).toHaveBeenCalledTimes(1);
  });

  it('GET /api/v1/ministries returns 403 for a plain Church Member without a Volunteer profile', async () => {
    activeChurchResolver.resolve.mockResolvedValue({
      ...createActiveChurchResolution(),
      volunteerId: null,
    });

    authorityGuard.resolveCallerCapabilities.mockResolvedValueOnce({
      churchId: '11111111-1111-1111-1111-111111111111',
      isChurchAdmin: false,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ministries',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'FORBIDDEN',
      message: m.error_forbidden(),
    });
    expect(ministryManager.listByLeader).not.toHaveBeenCalled();
  });
});

describe('Ministry Invitation minting routes', () => {
  const ministryId = '22222222-2222-2222-8222-222222222222';

  it('POST /api/v1/ministries/:ministryId/invitations mints and maps the response', async () => {
    ministryInvitationManager.mint.mockResolvedValue({
      id: 'ministry-invitation-1',
      kind: 'chained',
      status: 'pending',
      churchInvitationId: 'church-invitation-1',
      expiresAt: parseInstant({ value: '2030-01-01T00:00:00Z' }),
    });
    ministryInvitationManager.getDeliveryStatus.mockResolvedValue('pending');

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/ministries/${ministryId}/invitations`,
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
      redemptionPath: '/invitations/church/ministry-invitation-1',
      deliveryStatus: 'pending',
    });
    expect(ministryInvitationManager.mint).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId,
      inviterId: 'admin-leader-user',
      email: 'outsider@example.com',
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });
    expect(ministryInvitationManager.getDeliveryStatus).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryInvitationId: 'ministry-invitation-1',
    });
  });

  it('POST /api/v1/ministries/:ministryId/invitations rejects a malformed email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/ministries/${ministryId}/invitations`,
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
      expiresAt: parseInstant({ value: '2030-02-01T00:00:00Z' }),
    });
    ministryInvitationManager.getDeliveryStatus.mockResolvedValue('pending');

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/ministries/${ministryId}/invitations/ministry-invitation-1/resend`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 'ministry-invitation-1',
      kind: 'ministry-only',
      status: 'pending',
      expiresAt: '2030-02-01T00:00:00.000Z',
      redemptionPath: '/invitations/ministry/ministry-invitation-1',
      deliveryStatus: 'pending',
    });
    expect(ministryInvitationManager.getDeliveryStatus).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryInvitationId: 'ministry-invitation-1',
    });
    expect(ministryInvitationManager.resend).toHaveBeenCalledWith({
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId,
      ministryInvitationId: 'ministry-invitation-1',
      callerId: 'admin-leader-user',
    });
  });

  it.each([
    {
      route: 'mint',
      method: 'POST' as const,
      url: `/api/v1/ministries/${ministryId}/invitations`,
      payload: {
        email: 'outsider@example.com',
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      },
    },
    {
      route: 'resend',
      method: 'POST' as const,
      url: `/api/v1/ministries/${ministryId}/invitations/ministry-invitation-1/resend`,
      payload: undefined,
    },
  ])('$route returns 403 before any lookup for a caller who manages no Ministry', async ({
    method,
    url,
    payload,
  }) => {
    authorityGuard.decideManageAnyMinistry.mockResolvedValue({
      allowed: false,
      reason: 'INSUFFICIENT_ACCESS_LEVEL',
    });

    const response = await app.inject({ method, url, payload });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'FORBIDDEN',
      message: m.error_forbidden(),
    });
    expect(ministryInvitationManager.mint).not.toHaveBeenCalled();
    expect(ministryInvitationManager.resend).not.toHaveBeenCalled();
  });

  it('returns the same not-found body for a missing and a hidden Ministry once admitted', async () => {
    const hiddenMinistryId = '33333333-3333-3333-8333-333333333333';
    ministryInvitationManager.mint.mockRejectedValue(
      new MinistryInvitationNotFoundError(),
    );
    const payload = {
      email: 'outsider@example.com',
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    };

    const missing = await app.inject({
      method: 'POST',
      url: `/api/v1/ministries/${ministryId}/invitations`,
      payload,
    });
    const hidden = await app.inject({
      method: 'POST',
      url: `/api/v1/ministries/${hiddenMinistryId}/invitations`,
      payload,
    });

    expect(missing.statusCode).toBe(404);
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual(missing.json());
    expect(missing.json()).toEqual({
      error: 'MINISTRY_NOT_FOUND',
      message: m.error_ministry_not_found(),
    });
    expect(ministryInvitationManager.getDeliveryStatus).not.toHaveBeenCalled();
  });
});
