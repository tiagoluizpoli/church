import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChurchId } from '../../domain/branded-ids';

vi.mock('@church/auth', () => ({
  auth: {
    api: {
      signUpEmail: vi.fn(),
      acceptInvitation: vi.fn(),
      setActiveOrganization: vi.fn(),
    },
    handler: vi.fn(),
  },
}));

const { auth } = await import('@church/auth');
const { BetterAuthRedemptionIdentityGateway } = await import(
  './better-auth-redemption-identity-gateway'
);
const signUpEmail = vi.mocked(auth.api.signUpEmail);
const acceptInvitation = vi.mocked(auth.api.acceptInvitation);
const setActiveOrganization = vi.mocked(auth.api.setActiveOrganization);
const handler = vi.mocked(auth.handler);

interface AuthenticatedResponseInput {
  userId?: string;
}

function authenticatedResponse({
  userId = 'user-1',
}: AuthenticatedResponseInput = {}): Response {
  return new Response(JSON.stringify({ user: { id: userId } }), {
    headers: { 'set-cookie': 'session_token=session-token; HttpOnly' },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('BetterAuthRedemptionIdentityGateway', () => {
  it('signs up, then creates an authenticated session for the new user', async () => {
    signUpEmail.mockResolvedValue({ user: { id: 'new-user' } } as never);
    handler.mockResolvedValue(authenticatedResponse({ userId: 'new-user' }));
    const gateway = new BetterAuthRedemptionIdentityGateway();

    const result = await gateway.createAccount({
      email: 'new@example.test',
      name: 'New User',
      password: 'correct horse battery staple',
    });

    expect(signUpEmail).toHaveBeenCalledWith({
      body: {
        email: 'new@example.test',
        name: 'New User',
        password: 'correct horse battery staple',
      },
    });
    expect(result).toEqual({
      userId: 'new-user',
      sessionCookie: 'session_token=session-token; HttpOnly',
    });
  });

  it('falls back to sign-in when a retry reaches an account that already exists', async () => {
    signUpEmail.mockRejectedValue(new Error('User already exists.'));
    handler.mockResolvedValue(
      authenticatedResponse({ userId: 'existing-user' }),
    );
    const gateway = new BetterAuthRedemptionIdentityGateway();

    const result = await gateway.createAccount({
      email: 'existing@example.test',
      name: 'Existing User',
      password: 'correct horse battery staple',
    });

    expect(result).toMatchObject({
      userId: 'existing-user',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsuccessful or malformed sign-in response without yielding a session', async () => {
    signUpEmail.mockResolvedValue({ user: { id: 'new-user' } } as never);
    handler.mockResolvedValue(new Response('{}', { status: 401 }));
    const gateway = new BetterAuthRedemptionIdentityGateway();

    await expect(
      gateway.createAccount({
        email: 'new@example.test',
        name: 'New User',
        password: 'correct horse battery staple',
      }),
    ).rejects.toThrow('Better Auth did not create a session cookie.');
  });

  it('accepts the Church invitation and activates its Church with the session cookie', async () => {
    acceptInvitation.mockResolvedValue({} as never);
    setActiveOrganization.mockResolvedValue({} as never);
    const gateway = new BetterAuthRedemptionIdentityGateway();
    const sessionCookie = 'session_token=session-token; HttpOnly';

    await gateway.acceptChurchInvitation({
      churchInvitationId: 'church-invitation-1',
      sessionCookie,
    });
    await gateway.setActiveChurch({
      churchId: ChurchId.from('11111111-1111-4111-8111-111111111111'),
      sessionCookie,
    });

    const acceptInput = acceptInvitation.mock.calls[0]?.[0];
    const activeChurchInput = setActiveOrganization.mock.calls[0]?.[0];
    expect(acceptInput?.body).toEqual({ invitationId: 'church-invitation-1' });
    expect(acceptInput?.headers.get('cookie')).toBe(sessionCookie);
    expect(activeChurchInput?.body).toEqual({
      organizationId: '11111111-1111-4111-8111-111111111111',
    });
    expect(activeChurchInput?.headers.get('cookie')).toBe(sessionCookie);
  });
});
