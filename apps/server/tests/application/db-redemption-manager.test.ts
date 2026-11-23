import { describe, expect, it, vi } from 'vitest';
import { DbRedemptionManager } from '@/application/db-redemption-manager';
import {
  ChurchId,
  ChurchInvitationId,
  MinistryInvitationId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import type { InvitationVerificationCodeManager } from '@/domain/contracts/application/invitation-verification-code-manager';
import type {
  AcceptPendingMinistryInvitationInput,
  PublicRedemptionPreview,
} from '@/domain/contracts/application/redemption-manager';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { MinistryInvitationRepository } from '@/domain/contracts/infrastructure/ministry-invitation.repository';
import type { RedemptionRepository } from '@/domain/contracts/infrastructure/redemption.repository';
import type { RedemptionIdentityGateway } from '@/domain/contracts/infrastructure/redemption-identity-gateway';
import type { SecurityLogRepository } from '@/domain/contracts/infrastructure/security-log.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { Church } from '@/domain/entities/church';
import type { RedemptionBundle } from '@/domain/entities/redemption-bundle';
import { CrossChurchVolunteerConflictError } from '@/domain/errors/cross-church-volunteer-conflict';
import { VerificationCodeError } from '@/domain/errors/verification-code-error';
import { reviewTokenFor } from '@/domain/services/redemption-review-token';

const CHURCH_ID = ChurchId.from('11111111-1111-4111-8111-111111111111');
const MINISTRY_INVITATION_ID = MinistryInvitationId.from(
  '22222222-2222-4222-8222-222222222222',
);
const CHURCH_INVITATION_ID = ChurchInvitationId.from(
  '66666666-6666-4666-8666-666666666666',
);
const USER_ID = UserId.from('33333333-3333-4333-8333-333333333333');
const VOLUNTEER_ID = VolunteerId.from('44444444-4444-4444-8444-444444444444');
const SOURCE_CHURCH_ID = ChurchId.from('77777777-7777-4777-8777-777777777777');
const IDEMPOTENCY_KEY = '55555555-5555-4555-8555-555555555555';
const CHURCH_EXPIRES_AT = new Date('2026-08-03T12:00:00.000Z');
const BEFORE_EXPIRY = new Date('2026-08-01T12:00:00.000Z');
const CHURCH_ONLY_BUNDLE: RedemptionBundle = {
  churchAccessLevel: 'member',
  churchExpiresAt: CHURCH_EXPIRES_AT,
  ministries: [],
};

interface RedemptionManagerHarness {
  acceptedInputs: AcceptPendingMinistryInvitationInput[];
  churchRepository: ChurchRepository;
  identityGateway: RedemptionIdentityGateway;
  invitationRepository: Pick<
    MinistryInvitationRepository,
    | 'findPublicRedemptionPreview'
    | 'lockChurchInvitation'
    | 'findChurchInvitationContext'
    | 'isChurchInvitationAddressedToUser'
    | 'findRedemptionBundle'
  >;
  manager: DbRedemptionManager;
  recordChurchOnlyPartialAcceptance: ReturnType<typeof vi.fn>;
  verificationCodeManager: InvitationVerificationCodeManager;
}

interface CreateHarnessInput {
  accept?: () => Promise<void>;
  persist?: () => Promise<void>;
  previews?: (PublicRedemptionPreview | null)[];
  setActive?: () => Promise<void>;
  verify?: () => Promise<void>;
}

function createHarness({
  accept = async () => {},
  persist = async () => {},
  previews,
  setActive = async () => {},
  verify = async () => {},
}: CreateHarnessInput = {}): RedemptionManagerHarness {
  const preview: PublicRedemptionPreview = {
    churchId: CHURCH_ID,
    churchInvitationId: CHURCH_INVITATION_ID,
    email: 'invitee@example.test',
    churchName: 'St. Peter',
    churchAccessLevel: 'member',
    expiresAt: new Date('2026-08-03T12:00:00.000Z'),
    ministries: [
      {
        ministryInvitationId: MINISTRY_INVITATION_ID,
        ministryName: 'Worship',
        ministryAccessLevel: 'volunteer',
        roleNames: ['Singer'],
      },
    ],
  };
  let previewIndex = 0;
  const invitationRepository = {
    findPublicRedemptionPreview: vi.fn().mockImplementation(() => {
      const results = previews ?? [preview];
      const result = results[Math.min(previewIndex, results.length - 1)];
      previewIndex += 1;
      return Promise.resolve(result ?? null);
    }),
    lockChurchInvitation: vi
      .fn()
      .mockResolvedValue({ status: 'pending', resendCount: 0 }),
    findChurchInvitationContext: vi.fn().mockResolvedValue({
      churchId: CHURCH_ID,
      churchName: 'St. Peter',
      email: 'invitee@example.test',
      status: 'pending',
      churchAccessLevel: 'member',
      expiresAt: CHURCH_EXPIRES_AT,
    }),
    isChurchInvitationAddressedToUser: vi.fn().mockResolvedValue(true),
    findRedemptionBundle: vi.fn().mockResolvedValue(CHURCH_ONLY_BUNDLE),
  } as RedemptionManagerHarness['invitationRepository'];
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
    setActiveChurch: vi.fn().mockImplementation(setActive),
    isEmailRegistered: vi.fn().mockResolvedValue(false),
    verifyPassword: vi.fn().mockResolvedValue(true),
  };
  const acceptedInputs: AcceptPendingMinistryInvitationInput[] = [];
  const recordChurchOnlyPartialAcceptance = vi
    .fn()
    .mockResolvedValue(undefined);
  const redemptionRepository: RedemptionRepository = {
    lockInvitedMinistries: async () => {},
    async acceptPendingMinistryInvitation(input) {
      await persist();
      acceptedInputs.push(input);
      return VOLUNTEER_ID;
    },
    async declineMinistryInvitation() {},
    async declineChurchInvitation() {
      return 'declined' as const;
    },
    recordChurchInvitationAcceptance: async () => {},
    recordChurchOnlyPartialAcceptance,
  };
  const unitOfWork: UnitOfWork = {
    async run(fn) {
      const transaction = {} as TransactionContext;
      return fn(transaction);
    },
    async runWith({ work }) {
      return this.run(work);
    },
  };
  const securityLogRepository: SecurityLogRepository = {
    recordIdentityMismatch: vi.fn(),
  };
  const churchRepository: ChurchRepository = {
    getById: vi
      .fn()
      .mockResolvedValue({ name: 'Riverside Fellowship' } as Church),
    getBySlug: vi.fn(),
    listAdminUserIds: vi.fn(),
    findMemberEmail: vi.fn(),
    findMemberContact: vi.fn(),
    findUserName: vi.fn(),
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
    slugAvailability: vi.fn(),
    saveLogoKey: vi.fn(),
    findPublicIdentityBySlug: vi.fn(),
    findPublicAddresses: vi.fn(),
    getPublicContactDetails: vi.fn(),
    getAddressUsage: vi.fn(),
  };
  return {
    acceptedInputs,
    churchRepository,
    identityGateway,
    invitationRepository,
    manager: new DbRedemptionManager({
      churchRepository,
      identityGateway,
      invitationRepository:
        invitationRepository as MinistryInvitationRepository,
      invitationVerificationCodeManager: verificationCodeManager,
      redemptionRepository,
      securityLogRepository,
      unitOfWork,
      failureLog: { record: vi.fn() },
    }),
    recordChurchOnlyPartialAcceptance,
    verificationCodeManager,
  };
}

describe('DbRedemptionManager', () => {
  it('sends a verification code only after confirming a public invitation preview', async () => {
    const { manager, verificationCodeManager } = createHarness();

    const sent = await manager.requestVerificationCode({
      churchInvitationId: CHURCH_INVITATION_ID,
    });

    expect(sent).toBe(true);
    expect(verificationCodeManager.issue).toHaveBeenCalledWith({
      churchId: CHURCH_ID,
      churchInvitationId: CHURCH_INVITATION_ID,
      recipientEmail: 'invitee@example.test',
      churchName: 'St. Peter',
      now: expect.any(Date),
    });
  });

  it('sends no code for an unavailable Church Invitation', async () => {
    const { manager, verificationCodeManager } = createHarness({
      previews: [null],
    });

    await expect(
      manager.requestVerificationCode({
        churchInvitationId: CHURCH_INVITATION_ID,
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
      churchInvitationId: CHURCH_INVITATION_ID,
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
      churchInvitationId: CHURCH_INVITATION_ID,
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

  it('reports a retryable Ministry failure when the grant step throws', async () => {
    const { manager } = createHarness({
      persist: async () => {
        throw new Error('database unavailable');
      },
    });

    const outcome = await manager.redeemNewUser({
      churchInvitationId: CHURCH_INVITATION_ID,
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

  it('returns the cross-Church split naming both Churches when an active profile blocks the Ministry half', async () => {
    const { manager, recordChurchOnlyPartialAcceptance, churchRepository } =
      createHarness({
        persist: async () => {
          throw new CrossChurchVolunteerConflictError({
            sourceChurchId: SOURCE_CHURCH_ID,
          });
        },
      });

    const outcome = await manager.redeemNewUser({
      churchInvitationId: CHURCH_INVITATION_ID,
      name: 'New Volunteer',
      password: 'correct-horse-battery-staple',
      code: '123456',
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(outcome).toEqual({
      kind: 'church-only',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchId: CHURCH_ID,
      destinationChurchName: 'St. Peter',
      ministryInvitationId: MINISTRY_INVITATION_ID,
      ministryName: 'Worship',
      sessionCookie:
        'better-auth.session_token=session-token; Path=/; HttpOnly',
    });
    expect(churchRepository.getById).toHaveBeenCalledWith({
      id: SOURCE_CHURCH_ID,
    });
    expect(recordChurchOnlyPartialAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        churchId: CHURCH_ID,
        ministryInvitationId: MINISTRY_INVITATION_ID,
        userId: USER_ID,
        correlationId: IDEMPOTENCY_KEY,
      }),
    );
  });
});

describe('DbRedemptionManager signed-in Church-only acceptance', () => {
  function acceptReviewed(manager: DbRedemptionManager) {
    return manager.acceptChurchInvitation({
      churchInvitationId: CHURCH_INVITATION_ID,
      userId: USER_ID,
      sessionCookie: 'better-auth.session_token=session-token',
      idempotencyKey: IDEMPOTENCY_KEY,
      reviewToken: reviewTokenFor({ bundle: CHURCH_ONLY_BUNDLE }),
      now: BEFORE_EXPIRY,
    });
  }

  it('answers IDENTITY_FAILED when the identity gateway refuses the Church Invitation', async () => {
    const { manager, identityGateway } = createHarness({
      accept: () => Promise.reject(new Error('Better Auth refused')),
    });

    expect(await acceptReviewed(manager)).toEqual({
      kind: 'terminal-failure',
      reason: 'IDENTITY_FAILED',
    });
    expect(identityGateway.setActiveChurch).not.toHaveBeenCalled();
  });

  it('answers INVITATION_UNAVAILABLE when the invitation expires between the review and the lock', async () => {
    const { manager, invitationRepository, identityGateway } = createHarness();
    vi.mocked(invitationRepository.findRedemptionBundle).mockResolvedValue({
      ...CHURCH_ONLY_BUNDLE,
      churchExpiresAt: BEFORE_EXPIRY,
    });

    expect(await acceptReviewed(manager)).toEqual({
      kind: 'terminal-failure',
      reason: 'INVITATION_UNAVAILABLE',
    });
    expect(identityGateway.acceptChurchInvitation).not.toHaveBeenCalled();
  });

  it('answers retryable-failure when the identity gateway fails to set the Active Church', async () => {
    const { manager } = createHarness({
      setActive: () => Promise.reject(new Error('session write failed')),
    });

    expect(await acceptReviewed(manager)).toEqual({
      kind: 'retryable-failure',
      reason: 'IDENTITY_FAILED',
    });
  });
});
