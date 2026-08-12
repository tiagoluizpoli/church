import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import {
  ChurchId,
  MinistryInvitationId,
  UserId,
  VolunteerId,
} from '../domain/branded-ids';
import type { InvitationVerificationCodeManager } from '../domain/contracts/application/invitation-verification-code-manager';
import type {
  AcceptPendingMinistryInvitationInput,
  PublicRedemptionPreview,
} from '../domain/contracts/application/redemption-manager';
import type { MinistryInvitationRepository } from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type { RedemptionRepository } from '../domain/contracts/infrastructure/redemption.repository';
import type { RedemptionIdentityGateway } from '../domain/contracts/infrastructure/redemption-identity-gateway';
import type { SecurityLogRepository } from '../domain/contracts/infrastructure/security-log.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import { VerificationCodeError } from '../domain/errors/verification-code-error';
import { DbRedemptionManager } from './db-redemption-manager';

const CHURCH_ID = ChurchId.from('11111111-1111-4111-8111-111111111111');
const MINISTRY_INVITATION_ID = MinistryInvitationId.from(
  '22222222-2222-4222-8222-222222222222',
);
const USER_ID = UserId.from('33333333-3333-4333-8333-333333333333');
const VOLUNTEER_ID = VolunteerId.from('44444444-4444-4444-8444-444444444444');
const IDEMPOTENCY_KEY = '55555555-5555-4555-8555-555555555555';

interface RedemptionManagerHarness {
  acceptedInputs: AcceptPendingMinistryInvitationInput[];
  identityGateway: RedemptionIdentityGateway;
  invitationRepository: Pick<
    MinistryInvitationRepository,
    'findPublicRedemptionPreview'
  >;
  manager: DbRedemptionManager;
  verificationCodeManager: InvitationVerificationCodeManager;
}

interface CreateHarnessInput {
  accept?: () => Promise<void>;
  persist?: () => Promise<void>;
  previews?: PublicRedemptionPreview[];
  verify?: () => Promise<void>;
}

function createHarness({
  accept = async () => {},
  persist = async () => {},
  previews,
  verify = async () => {},
}: CreateHarnessInput = {}): RedemptionManagerHarness {
  const preview: PublicRedemptionPreview = {
    churchId: CHURCH_ID,
    churchInvitationId: '66666666-6666-4666-8666-666666666666',
    email: 'invitee@example.test',
    churchName: 'St. Peter',
    ministryName: 'Worship',
    ministryAccessLevel: 'volunteer',
    roleNames: ['Singer'],
    expiresAt: new Date('2026-08-03T12:00:00.000Z'),
    churchInvitationStatus: 'pending',
  };
  let previewIndex = 0;
  const invitationRepository = {
    findPublicRedemptionPreview: vi
      .fn()
      .mockImplementation(
        (
          input: Parameters<
            MinistryInvitationRepository['findPublicRedemptionPreview']
          >[0],
        ) => {
          const results = previews ?? [preview];
          const result = results[Math.min(previewIndex, results.length - 1)];
          previewIndex += 1;
          if (
            result?.churchInvitationStatus === 'accepted' &&
            !input.includeAcceptedChurchInvitation
          ) {
            return Promise.resolve(null);
          }
          return Promise.resolve(result);
        },
      ),
  } as Pick<MinistryInvitationRepository, 'findPublicRedemptionPreview'>;
  const verificationCodeManager: InvitationVerificationCodeManager = {
    issue: vi.fn(),
    verify: vi.fn().mockImplementation(verify),
  };
  const identityGateway: RedemptionIdentityGateway = {
    createAccount: vi.fn().mockResolvedValue({
      userId: USER_ID,
      sessionCookie:
        'better-auth.session_token=session-token; Path=/; HttpOnly',
    }),
    acceptChurchInvitation: vi.fn().mockImplementation(accept),
    rejectChurchInvitation: vi.fn(),
    setActiveChurch: vi.fn(),
  };
  const acceptedInputs: AcceptPendingMinistryInvitationInput[] = [];
  const redemptionRepository: RedemptionRepository = {
    async acceptPendingMinistryInvitation(input) {
      await persist();
      acceptedInputs.push(input);
      return VOLUNTEER_ID;
    },
    async declineMinistryInvitation() {},
  };
  const unitOfWork: UnitOfWork = {
    async run(fn) {
      const transaction = {} as TransactionContext;
      return fn(transaction);
    },
  };
  const securityLogRepository: SecurityLogRepository = {
    recordIdentityMismatch: vi.fn(),
  };
  return {
    acceptedInputs,
    identityGateway,
    invitationRepository,
    manager: new DbRedemptionManager({
      identityGateway,
      invitationRepository:
        invitationRepository as MinistryInvitationRepository,
      invitationVerificationCodeManager: verificationCodeManager,
      redemptionRepository,
      securityLogRepository,
      unitOfWork,
    }),
    verificationCodeManager,
  };
}

describe('DbRedemptionManager', () => {
  it('sends a verification code only after confirming a public invitation preview', async () => {
    const { manager, verificationCodeManager } = createHarness();

    const sent = await manager.requestVerificationCode({
      ministryInvitationId: MINISTRY_INVITATION_ID,
    });

    expect(sent).toBe(true);
    expect(verificationCodeManager.issue).toHaveBeenCalledWith({
      ministryInvitationId: MINISTRY_INVITATION_ID,
      recipientEmail: 'invitee@example.test',
      churchName: 'St. Peter',
      now: expect.any(Date),
    });
  });

  it('keeps accepted Church invitations unavailable to public code requests', async () => {
    const { manager, verificationCodeManager } = createHarness({
      previews: [
        {
          churchId: CHURCH_ID,
          churchInvitationId: '66666666-6666-4666-8666-666666666666',
          email: 'invitee@example.test',
          churchName: 'St. Peter',
          ministryName: 'Worship',
          ministryAccessLevel: 'volunteer',
          roleNames: ['Singer'],
          expiresAt: new Date('2026-08-03T12:00:00.000Z'),
          churchInvitationStatus: 'accepted',
        },
      ],
    });

    await expect(
      manager.requestVerificationCode({
        ministryInvitationId: MINISTRY_INVITATION_ID,
      }),
    ).resolves.toBe(false);

    expect(verificationCodeManager.issue).not.toHaveBeenCalled();
  });

  it('does not create an account when code verification fails', async () => {
    const verificationError = new VerificationCodeError({
      code: 'VERIFICATION_CODE_INVALID',
    });
    const { identityGateway, manager } = createHarness({
      verify: async () => {
        throw verificationError;
      },
    });

    const outcome = await manager.redeemNewUser({
      ministryInvitationId: MINISTRY_INVITATION_ID,
      name: 'New Volunteer',
      password: 'correct-horse-battery-staple',
      code: '000000',
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(outcome).toEqual({
      kind: 'terminal-failure',
      reason: 'VERIFICATION_FAILED',
    });
    expect(identityGateway.createAccount).not.toHaveBeenCalled();
  });

  it('forwards the authenticated session and correlation id after all checkpoints succeed', async () => {
    const { acceptedInputs, identityGateway, manager } = createHarness();

    const outcome = await manager.redeemNewUser({
      ministryInvitationId: MINISTRY_INVITATION_ID,
      name: 'New Volunteer',
      password: 'correct-horse-battery-staple',
      code: '123456',
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(outcome).toEqual({
      kind: 'full-success',
      volunteerId: VOLUNTEER_ID,
      sessionCookie:
        'better-auth.session_token=session-token; Path=/; HttpOnly',
    });
    const acceptInvitationMock = vi.mocked(
      identityGateway.acceptChurchInvitation,
    );
    const setActiveChurchMock = vi.mocked(identityGateway.setActiveChurch);
    expect(acceptInvitationMock.mock.invocationCallOrder[0]).toBeLessThan(
      setActiveChurchMock.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(acceptedInputs).toEqual([
      expect.objectContaining({ correlationId: IDEMPOTENCY_KEY }),
    ]);
  });

  it('keeps checkpoint-one and checkpoint-two state retryable when the ministry transaction fails', async () => {
    const { manager } = createHarness({
      accept: async () => {},
    });
    vi.spyOn(manager, 'acceptPendingMinistryInvitation').mockRejectedValue(
      new Error('database unavailable'),
    );

    const outcome = await manager.redeemNewUser({
      ministryInvitationId: MINISTRY_INVITATION_ID,
      name: 'New Volunteer',
      password: 'correct-horse-battery-staple',
      code: '123456',
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(outcome).toEqual({
      kind: 'retryable-failure',
      reason: 'MINISTRY_ACCEPTANCE_FAILED',
    });
  });

  it('resumes a checkpoint-three retry with the same code request identity', async () => {
    let attempt = 0;
    const { identityGateway, manager, verificationCodeManager } = createHarness(
      {
        persist: async () => {
          attempt += 1;
          if (attempt === 1) throw new Error('transient checkpoint failure');
        },
        previews: [
          {
            churchId: CHURCH_ID,
            churchInvitationId: '66666666-6666-4666-8666-666666666666',
            email: 'invitee@example.test',
            churchName: 'St. Peter',
            ministryName: 'Worship',
            ministryAccessLevel: 'volunteer',
            roleNames: ['Singer'],
            expiresAt: new Date('2026-08-03T12:00:00.000Z'),
            churchInvitationStatus: 'pending',
          },
          {
            churchId: CHURCH_ID,
            churchInvitationId: '66666666-6666-4666-8666-666666666666',
            email: 'invitee@example.test',
            churchName: 'St. Peter',
            ministryName: 'Worship',
            ministryAccessLevel: 'volunteer',
            roleNames: ['Singer'],
            expiresAt: new Date('2026-08-03T12:00:00.000Z'),
            churchInvitationStatus: 'accepted',
          },
        ],
      },
    );

    const input = {
      ministryInvitationId: MINISTRY_INVITATION_ID,
      name: 'New Volunteer',
      password: 'correct-horse-battery-staple',
      code: '123456',
      idempotencyKey: IDEMPOTENCY_KEY,
    };
    await expect(manager.redeemNewUser(input)).resolves.toEqual({
      kind: 'retryable-failure',
      reason: 'MINISTRY_ACCEPTANCE_FAILED',
    });
    await expect(manager.redeemNewUser(input)).resolves.toMatchObject({
      kind: 'full-success',
    });
    expect(identityGateway.acceptChurchInvitation).toHaveBeenCalledTimes(1);
    expect(verificationCodeManager.verify).toHaveBeenCalledTimes(2);
  });

  it('includes an accepted Church invitation only for a checkpoint-three retry', async () => {
    const { invitationRepository, manager } = createHarness();

    await manager.redeemNewUser({
      ministryInvitationId: MINISTRY_INVITATION_ID,
      name: 'New Volunteer',
      password: 'correct-horse-battery-staple',
      code: '123456',
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(
      invitationRepository.findPublicRedemptionPreview,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ includeAcceptedChurchInvitation: true }),
    );
  });
});
