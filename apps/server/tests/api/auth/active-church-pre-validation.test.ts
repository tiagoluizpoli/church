import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@church/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
      setActiveOrganization: vi.fn(),
    },
  },
}));

const { createActiveChurchPreValidation } = await import(
  '@/api/auth/active-church-pre-validation'
);
const { auth } = await import('@church/auth');

const mockGetSession = vi.mocked(auth.api.getSession);
const mockSetActiveOrganization = vi.mocked(auth.api.setActiveOrganization);

const resolver = { resolve: vi.fn() };

interface MockRequest {
  headers: Record<string, string>;
  log: { warn: ReturnType<typeof vi.fn> };
}

interface RequestFields {
  userId: string;
  churchId: string;
  volunteerId?: string;
}

function createRequest(): MockRequest {
  return { headers: {}, log: { warn: vi.fn() } };
}

function requestFields(request: MockRequest): RequestFields {
  return request as never as RequestFields;
}

function createReply() {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('createActiveChurchPreValidation', () => {
  it('denies with 401 when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);
    const hook = createActiveChurchPreValidation({
      resolver: resolver as never,
    });
    const request = createRequest();
    const reply = createReply();

    await hook(request as never, reply as never);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('sets churchId and userId, and omits volunteerId, when the resolver finds no Volunteer profile', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: 'chu_1' },
    } as never);
    resolver.resolve.mockResolvedValueOnce({
      status: 'resolved',
      churchId: 'chu_1',
      volunteerId: null,
      autoSelected: false,
    });
    const hook = createActiveChurchPreValidation({
      resolver: resolver as never,
    });
    const request = createRequest();
    const reply = createReply();

    await hook(request as never, reply as never);

    expect(reply.status).not.toHaveBeenCalled();
    expect(requestFields(request).userId).toBe('usr_1');
    expect(requestFields(request).churchId).toBe('chu_1');
    expect(requestFields(request).volunteerId).toBeUndefined();
    expect(resolver.resolve).toHaveBeenCalledWith({
      userId: 'usr_1',
      activeOrganizationId: 'chu_1',
    });
  });

  it('denies with 403 when requireVolunteer is set and the resolver finds no Volunteer profile', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: 'chu_1' },
    } as never);
    resolver.resolve.mockResolvedValueOnce({
      status: 'resolved',
      churchId: 'chu_1',
      volunteerId: null,
      autoSelected: false,
    });
    const hook = createActiveChurchPreValidation({
      resolver: resolver as never,
      requireVolunteer: true,
    });
    const request = createRequest();
    const reply = createReply();

    await hook(request as never, reply as never);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Volunteer profile not found' }),
    );
  });

  it('denies with 403 when requireVolunteer is set and a leftover profile has no active Ministry Membership', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: 'chu_1' },
    } as never);
    resolver.resolve.mockResolvedValueOnce({
      status: 'resolved',
      churchId: 'chu_1',
      volunteerId: 'vol_1',
      hasVolunteerMembership: false,
      autoSelected: false,
    });
    const hook = createActiveChurchPreValidation({
      resolver: resolver as never,
      requireVolunteer: true,
    });
    const request = createRequest();
    const reply = createReply();

    await hook(request as never, reply as never);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'FORBIDDEN' }),
    );
    expect(requestFields(request).volunteerId).toBeUndefined();
  });

  it('admits a serving Volunteer when requireVolunteer is set', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: 'chu_1' },
    } as never);
    resolver.resolve.mockResolvedValueOnce({
      status: 'resolved',
      churchId: 'chu_1',
      volunteerId: 'vol_1',
      hasVolunteerMembership: true,
      autoSelected: false,
    });
    const hook = createActiveChurchPreValidation({
      resolver: resolver as never,
      requireVolunteer: true,
    });
    const request = createRequest();
    const reply = createReply();

    await hook(request as never, reply as never);

    expect(reply.status).not.toHaveBeenCalled();
    expect(requestFields(request).volunteerId).toBe('vol_1');
  });

  it('responds 409 when Active Church selection is required', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: null },
    } as never);
    resolver.resolve.mockResolvedValueOnce({ status: 'selection_required' });
    const hook = createActiveChurchPreValidation({
      resolver: resolver as never,
    });
    const request = createRequest();
    const reply = createReply();

    await hook(request as never, reply as never);

    expect(reply.status).toHaveBeenCalledWith(409);
  });

  it('responds 403 when no Church Membership resolves at all, and does not touch the session when it had no active organization', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: null },
    } as never);
    resolver.resolve.mockResolvedValueOnce({ status: 'no_membership' });
    const hook = createActiveChurchPreValidation({
      resolver: resolver as never,
    });
    const request = createRequest();
    const reply = createReply();

    await hook(request as never, reply as never);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(mockSetActiveOrganization).not.toHaveBeenCalled();
  });

  it('clears a stale active organization from the session when the caller was removed from it', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: 'chu_removed' },
    } as never);
    resolver.resolve.mockResolvedValueOnce({ status: 'no_membership' });
    mockSetActiveOrganization.mockResolvedValueOnce(undefined as never);
    const hook = createActiveChurchPreValidation({
      resolver: resolver as never,
    });
    const request = createRequest();
    const reply = createReply();

    await hook(request as never, reply as never);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(mockSetActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: null } }),
    );
  });

  it('does not fail the request when clearing a stale active organization rejects', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: 'chu_removed' },
    } as never);
    resolver.resolve.mockResolvedValueOnce({ status: 'no_membership' });
    mockSetActiveOrganization.mockRejectedValueOnce(new Error('boom'));
    const hook = createActiveChurchPreValidation({
      resolver: resolver as never,
    });
    const request = createRequest();
    const reply = createReply();

    await expect(hook(request as never, reply as never)).resolves.toBeDefined();
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('persists an auto-selected Church onto the session via setActiveOrganization', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: null },
    } as never);
    resolver.resolve.mockResolvedValueOnce({
      status: 'resolved',
      churchId: 'chu_1',
      volunteerId: null,
      autoSelected: true,
    });
    mockSetActiveOrganization.mockResolvedValueOnce(undefined as never);
    const hook = createActiveChurchPreValidation({
      resolver: resolver as never,
    });
    const request = createRequest();
    const reply = createReply();

    await hook(request as never, reply as never);

    expect(mockSetActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: 'chu_1' } }),
    );
    expect(reply.status).not.toHaveBeenCalled();
    expect(requestFields(request).churchId).toBe('chu_1');
  });

  it('does not fail the request when persisting the auto-selected Church rejects', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: null },
    } as never);
    resolver.resolve.mockResolvedValueOnce({
      status: 'resolved',
      churchId: 'chu_1',
      volunteerId: null,
      autoSelected: true,
    });
    mockSetActiveOrganization.mockRejectedValueOnce(new Error('boom'));
    const hook = createActiveChurchPreValidation({
      resolver: resolver as never,
    });
    const request = createRequest();
    const reply = createReply();

    await expect(
      hook(request as never, reply as never),
    ).resolves.toBeUndefined();
    expect(requestFields(request).churchId).toBe('chu_1');
  });
  it('returns FORBIDDEN over HTTP for a valid signed-in session without Church Membership', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'usr_1' },
      session: { activeOrganizationId: null },
    } as never);
    resolver.resolve.mockResolvedValueOnce({ status: 'no_membership' });
    const app = Fastify();
    app.get(
      '/protected',
      {
        preValidation: createActiveChurchPreValidation({
          resolver: resolver as never,
        }),
      },
      async () => ({ granted: true }),
    );
    const response = await app.inject({ method: 'GET', url: '/protected' });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'FORBIDDEN',
      message: 'No active Church membership found',
    });
    await app.close();
  });
});
