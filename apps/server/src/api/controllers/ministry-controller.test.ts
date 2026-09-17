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
import { createFastify } from '../../main/fastify/setup';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { MinistryController } from './ministry-controller';

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
  hasSchedulingAccess: vi.fn(),
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
  const controller = new MinistryController(
    ministryManager as never,
    ministryInvitationManager as never,
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
  authorityGuard.hasSchedulingAccess.mockResolvedValue(true);
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

  it('GET /api/v1/ministries is gated by hasSchedulingAccess, not per-Ministry (self-scoped by leaderId)', async () => {
    ministryManager.listByLeader.mockResolvedValue([]);

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/v1/ministries',
    });
    expect(allowed.statusCode).toBe(200);

    authorityGuard.hasSchedulingAccess.mockResolvedValueOnce(false);
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/ministries',
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'Admin or leader role required',
    });
    expect(ministryManager.listByLeader).toHaveBeenCalledTimes(1);
  });

  it('GET /api/v1/ministries requires a Volunteer profile', async () => {
    activeChurchResolver.resolve.mockResolvedValue({
      ...createActiveChurchResolution(),
      volunteerId: null,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ministries',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'UNAUTHORIZED',
      message: 'Volunteer profile not found',
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
});
