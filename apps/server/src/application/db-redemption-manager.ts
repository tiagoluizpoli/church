import { injectable } from 'tsyringe';
import type { VolunteerId } from '../domain/branded-ids';
import type { InvitationVerificationCodeManager } from '../domain/contracts/application/invitation-verification-code-manager';
import type {
  AcceptExistingMemberInput,
  AcceptExistingMemberOutcome,
  AcceptPendingMinistryInvitationInput,
  AuthenticatedInvitationStatus,
  DeclineInvitationInput,
  DeclineInvitationOutcome,
  GetAuthenticatedInvitationStatusInput,
  GetDebugVerificationCodeInput,
  GetPublicRedemptionPreviewInput,
  PublicRedemptionPreview,
  RedeemNewUserInput,
  RedeemNewUserOutcome,
  RedemptionManager,
  RequestRedemptionCodeInput,
} from '../domain/contracts/application/redemption-manager';
import type {
  MinistryInvitationContext,
  MinistryInvitationRepository,
} from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type { RedemptionRepository } from '../domain/contracts/infrastructure/redemption.repository';
import type {
  CreateRedemptionAccountOutput,
  RedemptionIdentityGateway,
} from '../domain/contracts/infrastructure/redemption-identity-gateway';
import type { SecurityLogRepository } from '../domain/contracts/infrastructure/security-log.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VerificationCodeInspector } from '../domain/contracts/infrastructure/verification-code-inspector';
import type { MinistryInvitation } from '../domain/entities/ministry-invitation';
import { VerificationCodeError } from '../domain/errors/verification-code-error';

export interface DbRedemptionManagerDependencies {
  identityGateway: RedemptionIdentityGateway;
  invitationRepository: MinistryInvitationRepository;
  invitationVerificationCodeManager: InvitationVerificationCodeManager;
  redemptionRepository: RedemptionRepository;
  securityLogRepository: SecurityLogRepository;
  unitOfWork: UnitOfWork;
  /** Non-production only — see `getDebugVerificationCode`. */
  verificationCodeInspector?: VerificationCodeInspector;
}

interface ResolveInvitationContextInput {
  ministryInvitationId: AcceptExistingMemberInput['ministryInvitationId'];
  userId: AcceptExistingMemberInput['userId'];
  now: Date;
  /** The attempt's own correlation id, when the caller has one (e.g. `acceptExistingMember`'s idempotency key). */
  correlationId?: string;
}

type ResolvedInvitationContext =
  | { status: 'unavailable' }
  | { status: 'identity-mismatch' }
  | { status: 'already-accepted'; ministryInvitation: MinistryInvitation }
  | { status: 'redeemable'; context: MinistryInvitationContext };

/**
 * Checkpoint three from spec §7.4. This is intentionally transport-free: #99
 * will authenticate and call it, while this operation owns the sole database
 * transaction that creates grants and consumes the Ministry Invitation.
 */
@injectable()
export class DbRedemptionManager implements RedemptionManager {
  constructor({
    identityGateway,
    invitationRepository,
    invitationVerificationCodeManager,
    redemptionRepository,
    securityLogRepository,
    unitOfWork,
    verificationCodeInspector,
  }: DbRedemptionManagerDependencies) {
    this.identityGateway = identityGateway;
    this.invitationRepository = invitationRepository;
    this.invitationVerificationCodeManager = invitationVerificationCodeManager;
    this.redemptionRepository = redemptionRepository;
    this.securityLogRepository = securityLogRepository;
    this.unitOfWork = unitOfWork;
    this.verificationCodeInspector = verificationCodeInspector;
  }

  private readonly identityGateway: RedemptionIdentityGateway;
  private readonly invitationRepository: MinistryInvitationRepository;
  private readonly invitationVerificationCodeManager: InvitationVerificationCodeManager;
  private readonly redemptionRepository: RedemptionRepository;
  private readonly securityLogRepository: SecurityLogRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly verificationCodeInspector:
    | VerificationCodeInspector
    | undefined;

  async getPublicPreview({
    ministryInvitationId,
    now = new Date(),
  }: GetPublicRedemptionPreviewInput): Promise<PublicRedemptionPreview | null> {
    const preview = await this.invitationRepository.findPublicRedemptionPreview(
      {
        ministryInvitationId,
        now,
      },
    );
    if (!preview) return null;
    return preview;
  }

  async requestVerificationCode({
    ministryInvitationId,
    now = new Date(),
  }: RequestRedemptionCodeInput): Promise<boolean> {
    const preview = await this.getPublicPreview({ ministryInvitationId, now });
    if (!preview) return false;
    await this.invitationVerificationCodeManager.issue({
      ministryInvitationId,
      recipientEmail: preview.email,
      churchName: preview.churchName,
      now,
    });
    return true;
  }

  async redeemNewUser({
    ministryInvitationId,
    name,
    password,
    code,
    idempotencyKey,
    now = new Date(),
  }: RedeemNewUserInput): Promise<RedeemNewUserOutcome> {
    const preview = await this.invitationRepository.findPublicRedemptionPreview(
      { ministryInvitationId, now, includeAcceptedChurchInvitation: true },
    );
    if (!preview)
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    try {
      await this.invitationVerificationCodeManager.verify({
        ministryInvitationId,
        code,
        idempotencyKey,
        now,
      });
    } catch (error) {
      if (error instanceof VerificationCodeError) {
        return { kind: 'terminal-failure', reason: 'VERIFICATION_FAILED' };
      }
      throw error;
    }
    let account: CreateRedemptionAccountOutput;
    try {
      account = await this.identityGateway.createAccount({
        email: preview.email,
        name,
        password,
      });
      if (preview.churchInvitationStatus === 'pending') {
        await this.identityGateway.acceptChurchInvitation({
          churchInvitationId: preview.churchInvitationId,
          sessionCookie: account.sessionCookie,
        });
      }
      await this.identityGateway.setActiveChurch({
        churchId: preview.churchId,
        sessionCookie: account.sessionCookie,
      });
    } catch {
      return { kind: 'terminal-failure', reason: 'IDENTITY_FAILED' };
    }
    try {
      const volunteerId = await this.acceptPendingMinistryInvitation({
        churchId: preview.churchId,
        ministryInvitationId,
        userId: account.userId,
        acceptedAt: now,
        correlationId: idempotencyKey,
        auditAction: 'acceptance',
      });
      return {
        kind: 'full-success',
        volunteerId,
        sessionCookie: account.sessionCookie,
      };
    } catch {
      return {
        kind: 'retryable-failure',
        reason: 'MINISTRY_ACCEPTANCE_FAILED',
      };
    }
  }

  async acceptPendingMinistryInvitation({
    churchId,
    ministryInvitationId,
    userId,
    acceptedAt,
    correlationId,
    auditAction = 'acceptance',
  }: AcceptPendingMinistryInvitationInput): Promise<VolunteerId> {
    return this.unitOfWork.run((tx) =>
      this.redemptionRepository.acceptPendingMinistryInvitation({
        churchId,
        ministryInvitationId,
        userId,
        acceptedAt,
        correlationId: correlationId ?? crypto.randomUUID(),
        auditAction,
        tx,
      }),
    );
  }

  /**
   * Shared preamble for every existing-member/lifecycle-branch entry point:
   * resolve the invitation, then the wrong-account check (spec §7.3) — a
   * mismatch is recorded to the security log here, once, so every caller
   * gets it for free rather than re-deriving it.
   */
  private async resolveInvitationContext({
    ministryInvitationId,
    userId,
    now,
    correlationId,
  }: ResolveInvitationContextInput): Promise<ResolvedInvitationContext> {
    const context =
      await this.invitationRepository.findMinistryInvitationContext({
        ministryInvitationId,
      });
    if (!context) return { status: 'unavailable' };
    const addressed =
      await this.invitationRepository.isInvitationAddressedToUser({
        ministryInvitation: context.ministryInvitation,
        userId,
      });
    if (!addressed) {
      await this.securityLogRepository.recordIdentityMismatch({
        churchId: context.ministryInvitation.churchId,
        ministryInvitationId,
        actorId: userId,
        correlationId: correlationId ?? crypto.randomUUID(),
        now,
      });
      return { status: 'identity-mismatch' };
    }
    if (context.ministryInvitation.status === 'accepted') {
      return {
        status: 'already-accepted',
        ministryInvitation: context.ministryInvitation,
      };
    }
    return { status: 'redeemable', context };
  }

  async getAuthenticatedInvitationStatus({
    ministryInvitationId,
    userId,
    now = new Date(),
  }: GetAuthenticatedInvitationStatusInput): Promise<AuthenticatedInvitationStatus> {
    const resolved = await this.resolveInvitationContext({
      ministryInvitationId,
      userId,
      now,
    });
    if (resolved.status === 'unavailable') return { kind: 'unavailable' };
    if (resolved.status === 'identity-mismatch')
      return { kind: 'identity-mismatch' };
    if (resolved.status === 'already-accepted') {
      return {
        kind: 'already-accepted',
        churchId: resolved.ministryInvitation.churchId,
      };
    }
    const { ministryInvitation } = resolved.context;
    if (
      ministryInvitation.status !== 'pending' ||
      ministryInvitation.expiresAt <= now
    ) {
      return { kind: 'unavailable' };
    }
    return {
      kind: 'redeemable',
      email: resolved.context.email,
      churchName: resolved.context.churchName,
      ministryName: resolved.context.ministryName,
      ministryAccessLevel: ministryInvitation.ministryAccessLevel,
      roleNames: resolved.context.roleNames,
      expiresAt: ministryInvitation.expiresAt,
    };
  }

  async acceptExistingMember({
    ministryInvitationId,
    userId,
    sessionCookie,
    idempotencyKey,
    now = new Date(),
  }: AcceptExistingMemberInput): Promise<AcceptExistingMemberOutcome> {
    const resolved = await this.resolveInvitationContext({
      ministryInvitationId,
      userId,
      now,
      correlationId: idempotencyKey,
    });
    if (resolved.status === 'unavailable')
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    if (resolved.status === 'identity-mismatch')
      return { kind: 'identity-mismatch' };
    if (resolved.status === 'already-accepted') {
      return {
        kind: 'already-accepted',
        churchId: resolved.ministryInvitation.churchId,
      };
    }
    const { ministryInvitation } = resolved.context;
    if (
      ministryInvitation.status !== 'pending' ||
      ministryInvitation.expiresAt <= now
    ) {
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    }
    if (
      ministryInvitation.kind === 'chained' &&
      resolved.context.churchInvitationStatus === 'pending'
    ) {
      try {
        await this.identityGateway.acceptChurchInvitation({
          churchInvitationId: ministryInvitation.churchInvitationId as string,
          sessionCookie,
        });
      } catch {
        return { kind: 'terminal-failure', reason: 'IDENTITY_FAILED' };
      }
    }
    try {
      const volunteerId = await this.acceptPendingMinistryInvitation({
        churchId: ministryInvitation.churchId,
        ministryInvitationId,
        userId,
        acceptedAt: now,
        correlationId: idempotencyKey,
        auditAction: 'ministry_acceptance',
      });
      return { kind: 'full-success', volunteerId };
    } catch {
      return {
        kind: 'retryable-failure',
        reason: 'MINISTRY_ACCEPTANCE_FAILED',
      };
    }
  }

  async declineInvitation({
    ministryInvitationId,
    userId,
    sessionCookie,
    now = new Date(),
  }: DeclineInvitationInput): Promise<DeclineInvitationOutcome> {
    const resolved = await this.resolveInvitationContext({
      ministryInvitationId,
      userId,
      now,
    });
    if (resolved.status === 'unavailable')
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    if (resolved.status === 'identity-mismatch')
      return { kind: 'identity-mismatch' };
    if (resolved.status === 'already-accepted') {
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    }
    const { ministryInvitation } = resolved.context;
    if (ministryInvitation.status === 'rejected') return { kind: 'declined' };
    if (
      ministryInvitation.status !== 'pending' ||
      ministryInvitation.expiresAt <= now
    ) {
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    }
    if (
      ministryInvitation.kind === 'chained' &&
      resolved.context.churchInvitationStatus === 'pending'
    ) {
      try {
        await this.identityGateway.rejectChurchInvitation({
          churchInvitationId: ministryInvitation.churchInvitationId as string,
          sessionCookie,
        });
      } catch {
        return { kind: 'terminal-failure', reason: 'IDENTITY_FAILED' };
      }
    }
    await this.unitOfWork.run((tx) =>
      this.redemptionRepository.declineMinistryInvitation({
        churchId: ministryInvitation.churchId,
        ministryInvitationId,
        userId,
        declinedAt: now,
        correlationId: crypto.randomUUID(),
        tx,
      }),
    );
    return { kind: 'declined' };
  }

  async getDebugVerificationCode({
    ministryInvitationId,
    now = new Date(),
  }: GetDebugVerificationCodeInput): Promise<string | null> {
    if (!this.verificationCodeInspector) return null;
    const preview = await this.getPublicPreview({ ministryInvitationId, now });
    if (!preview) return null;
    return (
      this.verificationCodeInspector.lastVerificationCodeFor({
        to: preview.email,
      }) ?? null
    );
  }
}
