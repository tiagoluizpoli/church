import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  ChurchId,
  MinistryInvitationId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { RedemptionManager } from '../../domain/contracts/application/redemption-manager';
import type { VolunteerTransferManager } from '../../domain/contracts/application/volunteer-transfer-manager';
import { VerificationCodeError } from '../../domain/errors/verification-code-error';
import { createFastify } from '../../main/fastify/setup';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { RedemptionController } from './redemption-controller';

vi.mock('@church/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@church/auth')).auth.api.getSession,
);

const INVITATION_ID = '11111111-1111-4111-8111-111111111111';
const VOLUNTEER_ID = '22222222-2222-4222-8222-222222222222';
const AUTH_COOKIE = 'better-auth.session_token=session-token';
const USER_ID = 'usr_1';

const redemptionManager: RedemptionManager = {
  getPublicPreview: vi.fn(),
  requestVerificationCode: vi.fn(),
  redeemNewUser: vi.fn(),
  acceptPendingMinistryInvitation: vi.fn(),
  getAuthenticatedInvitationStatus: vi.fn(),
  acceptExistingMember: vi.fn(),
  declineInvitation: vi.fn(),
  getDebugVerificationCode: vi.fn(),
};

const volunteerTransferManager: VolunteerTransferManager = {
  getTransferPreview: vi.fn(),
  confirmTransfer: vi.fn(),
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify();
  const controller = new RedemptionController({
    redemptionManager,
    volunteerTransferManager,
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
});

describe('RedemptionController', () => {
  it('returns only the public preview fields for an available invitation', async () => {
    vi.mocked(redemptionManager.getPublicPreview).mockResolvedValue({
      churchId: ChurchId.from('33333333-3333-4333-8333-333333333333'),
      churchInvitationId: '44444444-4444-4444-8444-444444444444',
      email: 'invitee@example.test',
      churchName: 'St. Peter',
      ministryName: 'Worship',
      ministryAccessLevel: 'volunteer',
      roleNames: ['Singer'],
      expiresAt: new Date('2026-08-03T12:00:00.000Z'),
      churchInvitationStatus: 'pending',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/redemption/church/${INVITATION_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      email: 'invitee@example.test',
      churchName: 'St. Peter',
      ministryName: 'Worship',
      ministryAccessLevel: 'volunteer',
      roleNames: ['Singer'],
      expiresAt: '2026-08-03T12:00:00.000Z',
    });
  });

  it('returns the same unavailable response from preview and code request', async () => {
    vi.mocked(redemptionManager.getPublicPreview).mockResolvedValue(null);
    vi.mocked(redemptionManager.requestVerificationCode).mockResolvedValue(
      false,
    );

    const previewResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/redemption/church/${INVITATION_ID}`,
    });
    const codeResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/church/${INVITATION_ID}/code`,
    });

    expect(previewResponse.statusCode).toBe(404);
    expect(codeResponse.statusCode).toBe(404);
    expect(previewResponse.json()).toEqual({ error: 'INVITATION_UNAVAILABLE' });
    expect(codeResponse.json()).toEqual({ error: 'INVITATION_UNAVAILABLE' });
  });

  it('rate-limits the public preview and verification-code endpoints', async () => {
    vi.mocked(redemptionManager.getPublicPreview).mockResolvedValue(null);

    for (let requestCount = 0; requestCount < 30; requestCount += 1) {
      await app.inject({
        method: 'GET',
        url: `/api/v1/redemption/church/${INVITATION_ID}`,
        remoteAddress: '203.0.113.10',
      });
    }
    const codeResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/church/${INVITATION_ID}/code`,
      remoteAddress: '203.0.113.10',
    });

    expect(codeResponse.statusCode).toBe(429);
    expect(codeResponse.json()).toEqual({ error: 'RATE_LIMITED' });
    expect(redemptionManager.requestVerificationCode).not.toHaveBeenCalled();
  });

  it('does not disclose a verification-code resend cooldown', async () => {
    vi.mocked(redemptionManager.requestVerificationCode).mockRejectedValue(
      new VerificationCodeError({
        code: 'VERIFICATION_CODE_RESEND_COOLDOWN_ACTIVE',
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/church/${INVITATION_ID}/code`,
      remoteAddress: '198.51.100.10',
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: 'RATE_LIMITED' });
  });

  it('forwards the authenticated session cookie on a full redemption', async () => {
    vi.mocked(redemptionManager.redeemNewUser).mockResolvedValue({
      kind: 'full-success',
      volunteerId: VolunteerId.from(VOLUNTEER_ID),
      sessionCookie: 'better-auth.session_token=token; Path=/; HttpOnly',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/church/${INVITATION_ID}/redeem`,
      payload: {
        name: 'New Volunteer',
        password: 'correct-horse-battery-staple',
        code: '123456',
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toContain(
      'better-auth.session_token',
    );
    expect(response.json()).toEqual({
      kind: 'full-success',
      volunteerId: VOLUNTEER_ID,
    });
  });

  it('passes the cross-Church split outcome through, naming both Churches', async () => {
    vi.mocked(redemptionManager.redeemNewUser).mockResolvedValue({
      kind: 'church-only',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchName: 'Northgate Community Church',
      ministryInvitationId: MinistryInvitationId.from(INVITATION_ID),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/church/${INVITATION_ID}/redeem`,
      payload: {
        name: 'New Volunteer',
        password: 'correct-horse-battery-staple',
        code: '123456',
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      kind: 'church-only',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchName: 'Northgate Community Church',
      ministryInvitationId: INVITATION_ID,
    });
  });

  it('returns a typed terminal failure when verification cannot proceed', async () => {
    vi.mocked(redemptionManager.redeemNewUser).mockResolvedValue({
      kind: 'terminal-failure',
      reason: 'VERIFICATION_FAILED',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/church/${INVITATION_ID}/redeem`,
      payload: {
        name: 'New Volunteer',
        password: 'correct-horse-battery-staple',
        code: '000000',
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      kind: 'terminal-failure',
      reason: 'VERIFICATION_FAILED',
    });
  });

  it('hands back the debug verification code the manager reports', async () => {
    vi.mocked(redemptionManager.getDebugVerificationCode).mockResolvedValue(
      '654321',
    );

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/redemption/church/${INVITATION_ID}/debug-code`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ code: '654321' });
  });

  it('404s the debug-code route when no code was captured for the invitation', async () => {
    vi.mocked(redemptionManager.getDebugVerificationCode).mockResolvedValue(
      null,
    );

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/redemption/church/${INVITATION_ID}/debug-code`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'INVITATION_UNAVAILABLE' });
  });
});

describe('GET /redemption/ministry/:invitationId', () => {
  it('returns 401 when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/redemption/ministry/${INVITATION_ID}`,
    });

    expect(response.statusCode).toBe(401);
    expect(
      redemptionManager.getAuthenticatedInvitationStatus,
    ).not.toHaveBeenCalled();
  });

  it('returns the redeemable status for the intended, authenticated User', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: USER_ID },
      session: { activeOrganizationId: null },
    } as never);
    vi.mocked(
      redemptionManager.getAuthenticatedInvitationStatus,
    ).mockResolvedValue({
      kind: 'redeemable',
      invitationKind: 'ministry-only',
      email: 'existing-member@example.test',
      churchName: 'St. Peter',
      ministryName: 'Worship',
      ministryAccessLevel: 'volunteer',
      roleNames: ['Singer'],
      expiresAt: new Date('2026-08-03T12:00:00.000Z'),
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/redemption/ministry/${INVITATION_ID}`,
      headers: { cookie: AUTH_COOKIE },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      kind: 'redeemable',
      invitationKind: 'ministry-only',
      email: 'existing-member@example.test',
      churchName: 'St. Peter',
      ministryName: 'Worship',
      ministryAccessLevel: 'volunteer',
      roleNames: ['Singer'],
      expiresAt: '2026-08-03T12:00:00.000Z',
    });
    expect(
      redemptionManager.getAuthenticatedInvitationStatus,
    ).toHaveBeenCalledWith({
      ministryInvitationId: INVITATION_ID,
      userId: USER_ID,
    });
  });

  it('never surfaces the invited email for a wrong signed-in account', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: USER_ID },
      session: { activeOrganizationId: null },
    } as never);
    vi.mocked(
      redemptionManager.getAuthenticatedInvitationStatus,
    ).mockResolvedValue({ kind: 'identity-mismatch' });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/redemption/ministry/${INVITATION_ID}`,
      headers: { cookie: AUTH_COOKIE },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ kind: 'identity-mismatch' });
    expect(response.body).not.toContain('@');
  });

  it('offers Continue to Church for an already-accepted invitation', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: USER_ID },
      session: { activeOrganizationId: null },
    } as never);
    vi.mocked(
      redemptionManager.getAuthenticatedInvitationStatus,
    ).mockResolvedValue({
      kind: 'already-accepted',
      churchId: ChurchId.from('33333333-3333-4333-8333-333333333333'),
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/redemption/ministry/${INVITATION_ID}`,
      headers: { cookie: AUTH_COOKIE },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      kind: 'already-accepted',
      churchId: '33333333-3333-4333-8333-333333333333',
    });
  });
});

describe('POST /redemption/ministry/:invitationId/accept', () => {
  it('returns 401 when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/ministry/${INVITATION_ID}/accept`,
      payload: { idempotencyKey: '55555555-5555-4555-8555-555555555555' },
    });

    expect(response.statusCode).toBe(401);
    expect(redemptionManager.acceptExistingMember).not.toHaveBeenCalled();
  });

  it('accepts on behalf of the authenticated, addressed User', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: USER_ID },
      session: { activeOrganizationId: null },
    } as never);
    vi.mocked(redemptionManager.acceptExistingMember).mockResolvedValue({
      kind: 'full-success',
      volunteerId: VolunteerId.from(VOLUNTEER_ID),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/ministry/${INVITATION_ID}/accept`,
      headers: { cookie: AUTH_COOKIE },
      payload: { idempotencyKey: '55555555-5555-4555-8555-555555555555' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      kind: 'full-success',
      volunteerId: VOLUNTEER_ID,
    });
    expect(redemptionManager.acceptExistingMember).toHaveBeenCalledWith({
      ministryInvitationId: INVITATION_ID,
      userId: USER_ID,
      sessionCookie: AUTH_COOKIE,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    });
  });

  it('is idempotent: acceptance already granted is reported, not re-executed', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: USER_ID },
      session: { activeOrganizationId: null },
    } as never);
    vi.mocked(redemptionManager.acceptExistingMember).mockResolvedValue({
      kind: 'already-accepted',
      churchId: ChurchId.from('33333333-3333-4333-8333-333333333333'),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/ministry/${INVITATION_ID}/accept`,
      headers: { cookie: AUTH_COOKIE },
      payload: { idempotencyKey: '55555555-5555-4555-8555-555555555555' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      kind: 'already-accepted',
      churchId: '33333333-3333-4333-8333-333333333333',
    });
  });
});

describe('decline endpoints', () => {
  it('POST /redemption/ministry/:invitationId/decline returns 401 without a session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/ministry/${INVITATION_ID}/decline`,
    });

    expect(response.statusCode).toBe(401);
    expect(redemptionManager.declineInvitation).not.toHaveBeenCalled();
  });

  it('POST /redemption/ministry/:invitationId/decline rejects only the Ministry-only invitation', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: USER_ID },
      session: { activeOrganizationId: null },
    } as never);
    vi.mocked(redemptionManager.declineInvitation).mockResolvedValue({
      kind: 'declined',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/ministry/${INVITATION_ID}/decline`,
      headers: { cookie: AUTH_COOKIE },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ kind: 'declined' });
    expect(redemptionManager.declineInvitation).toHaveBeenCalledWith({
      ministryInvitationId: INVITATION_ID,
      userId: USER_ID,
      sessionCookie: AUTH_COOKIE,
    });
  });

  it('POST /redemption/church/:invitationId/decline returns 401 without a session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/church/${INVITATION_ID}/decline`,
    });

    expect(response.statusCode).toBe(401);
    expect(redemptionManager.declineInvitation).not.toHaveBeenCalled();
  });

  it('POST /redemption/church/:invitationId/decline rejects the chained pair through the same manager call', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: USER_ID },
      session: { activeOrganizationId: null },
    } as never);
    vi.mocked(redemptionManager.declineInvitation).mockResolvedValue({
      kind: 'declined',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/church/${INVITATION_ID}/decline`,
      headers: { cookie: AUTH_COOKIE },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ kind: 'declined' });
    expect(redemptionManager.declineInvitation).toHaveBeenCalledWith({
      ministryInvitationId: INVITATION_ID,
      userId: USER_ID,
      sessionCookie: AUTH_COOKIE,
    });
  });

  it('GET /redemption/transfer/:invitationId/preview returns 401 without a session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/redemption/transfer/${INVITATION_ID}/preview`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /redemption/transfer/:invitationId/preview serializes the reviewable impact for the authenticated User', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: USER_ID },
      session: { activeOrganizationId: null },
    } as never);
    vi.mocked(volunteerTransferManager.getTransferPreview).mockResolvedValue({
      kind: 'reviewable',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchName: 'Northgate Community Church',
      endedMemberships: [{ ministryName: 'Hospitality' }],
      withdrawnAssignments: [
        {
          eventName: 'Transfer Sunday',
          timeSlotStart: new Date('2026-09-20T09:00:00.000Z'),
          roleName: 'Greeter',
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/redemption/transfer/${INVITATION_ID}/preview`,
      headers: { cookie: AUTH_COOKIE },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      kind: 'reviewable',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchName: 'Northgate Community Church',
      endedMemberships: [{ ministryName: 'Hospitality' }],
      withdrawnAssignments: [
        {
          eventName: 'Transfer Sunday',
          timeSlotStart: '2026-09-20T09:00:00.000Z',
          roleName: 'Greeter',
        },
      ],
    });
  });

  it('POST /redemption/transfer/:invitationId/confirm returns 401 without a session', async () => {
    mockGetSession.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/transfer/${INVITATION_ID}/confirm`,
      payload: {
        destinationChurchName: 'Northgate Community Church',
        password: 'correct-horse-battery-staple',
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('POST /redemption/transfer/:invitationId/confirm forwards the layer-3 inputs and returns the outcome without a session cookie', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: USER_ID },
      session: { activeOrganizationId: null },
    } as never);
    vi.mocked(volunteerTransferManager.confirmTransfer).mockResolvedValue({
      kind: 'password-mismatch',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/transfer/${INVITATION_ID}/confirm`,
      headers: { cookie: AUTH_COOKIE },
      payload: {
        destinationChurchName: 'Northgate Community Church',
        password: 'wrong-password-here',
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ kind: 'password-mismatch' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(volunteerTransferManager.confirmTransfer).toHaveBeenCalledWith({
      ministryInvitationId: INVITATION_ID,
      userId: USER_ID,
      destinationChurchName: 'Northgate Community Church',
      password: 'wrong-password-here',
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    });
  });
});
