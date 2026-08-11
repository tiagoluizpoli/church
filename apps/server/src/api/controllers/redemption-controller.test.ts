import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ChurchId, VolunteerId } from '../../domain/branded-ids';
import type { RedemptionManager } from '../../domain/contracts/application/redemption-manager';
import { VerificationCodeError } from '../../domain/errors/verification-code-error';
import { createFastify } from '../../main/fastify/setup';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { RedemptionController } from './redemption-controller';

const INVITATION_ID = '11111111-1111-4111-8111-111111111111';
const VOLUNTEER_ID = '22222222-2222-4222-8222-222222222222';

const redemptionManager: RedemptionManager = {
  getPublicPreview: vi.fn(),
  requestVerificationCode: vi.fn(),
  redeemNewUser: vi.fn(),
  acceptPendingMinistryInvitation: vi.fn(),
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify();
  const controller = new RedemptionController({ redemptionManager });
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

  it('exposes the church-only union member without making it reachable in this flow', async () => {
    vi.mocked(redemptionManager.redeemNewUser).mockResolvedValue({
      kind: 'church-only',
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
    expect(response.json()).toEqual({ kind: 'church-only' });
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
});
