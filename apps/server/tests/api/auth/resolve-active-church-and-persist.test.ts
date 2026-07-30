import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@church/auth', () => ({
  auth: {
    api: {
      setActiveOrganization: vi.fn(),
    },
  },
}));

const { resolveActiveChurchAndPersist } = await import(
  '../../../src/api/auth/resolve-active-church-and-persist'
);
const { auth } = await import('@church/auth');

const mockSetActiveOrganization = vi.mocked(auth.api.setActiveOrganization);

const resolver = { resolve: vi.fn() };

interface MockRequest {
  headers: Record<string, string>;
  log: { warn: ReturnType<typeof vi.fn> };
}

function createRequest(): MockRequest {
  return { headers: {}, log: { warn: vi.fn() } };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('resolveActiveChurchAndPersist', () => {
  it('persists a silent auto-select onto the session', async () => {
    resolver.resolve.mockResolvedValueOnce({
      status: 'resolved',
      churchId: 'chu_1',
      volunteerId: null,
      autoSelected: true,
    });
    mockSetActiveOrganization.mockResolvedValueOnce(undefined as never);

    const resolution = await resolveActiveChurchAndPersist({
      resolver: resolver as never,
      request: createRequest() as never,
      userId: 'usr_1' as never,
      activeOrganizationId: null,
    });

    expect(resolution).toEqual({
      status: 'resolved',
      churchId: 'chu_1',
      volunteerId: null,
      autoSelected: true,
    });
    expect(mockSetActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: 'chu_1' } }),
    );
  });

  it('does not touch the session when resolving against an already-active Church', async () => {
    resolver.resolve.mockResolvedValueOnce({
      status: 'resolved',
      churchId: 'chu_1',
      volunteerId: null,
      autoSelected: false,
    });

    await resolveActiveChurchAndPersist({
      resolver: resolver as never,
      request: createRequest() as never,
      userId: 'usr_1' as never,
      activeOrganizationId: 'chu_1' as never,
    });

    expect(mockSetActiveOrganization).not.toHaveBeenCalled();
  });

  it('clears a stale active organization when the resolution denies with no_membership', async () => {
    resolver.resolve.mockResolvedValueOnce({
      status: 'no_membership',
      membershipRemovedFrom: 'Former Home Church',
    });
    mockSetActiveOrganization.mockResolvedValueOnce(undefined as never);

    await resolveActiveChurchAndPersist({
      resolver: resolver as never,
      request: createRequest() as never,
      userId: 'usr_1' as never,
      activeOrganizationId: 'chu_removed' as never,
    });

    expect(mockSetActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: null } }),
    );
  });

  it('clears a stale active organization when the resolution requires selection among the remaining Memberships', async () => {
    resolver.resolve.mockResolvedValueOnce({
      status: 'selection_required',
      membershipRemovedFrom: 'Former Home Church',
    });
    mockSetActiveOrganization.mockResolvedValueOnce(undefined as never);

    await resolveActiveChurchAndPersist({
      resolver: resolver as never,
      request: createRequest() as never,
      userId: 'usr_1' as never,
      activeOrganizationId: 'chu_removed' as never,
    });

    expect(mockSetActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: null } }),
    );
  });

  it('does not attempt to clear when the session had no active organization to begin with', async () => {
    resolver.resolve.mockResolvedValueOnce({ status: 'no_membership' });

    await resolveActiveChurchAndPersist({
      resolver: resolver as never,
      request: createRequest() as never,
      userId: 'usr_1' as never,
      activeOrganizationId: null,
    });

    expect(mockSetActiveOrganization).not.toHaveBeenCalled();
  });

  it('does not fail the caller when clearing a stale active organization rejects', async () => {
    resolver.resolve.mockResolvedValueOnce({ status: 'no_membership' });
    mockSetActiveOrganization.mockRejectedValueOnce(new Error('boom'));

    const resolution = await resolveActiveChurchAndPersist({
      resolver: resolver as never,
      request: createRequest() as never,
      userId: 'usr_1' as never,
      activeOrganizationId: 'chu_removed' as never,
    });

    expect(resolution).toEqual({ status: 'no_membership' });
  });
});
