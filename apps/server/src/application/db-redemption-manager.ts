import { injectable } from 'tsyringe';
import type { VolunteerId } from '../domain/branded-ids';
import type { InvitationVerificationCodeManager } from '../domain/contracts/application/invitation-verification-code-manager';
import type {
  AcceptPendingMinistryInvitationInput,
  GetDebugVerificationCodeInput,
  GetPublicRedemptionPreviewInput,
  PublicRedemptionPreview,
  RedeemNewUserInput,
  RedeemNewUserOutcome,
  RedemptionManager,
  RequestRedemptionCodeInput,
} from '../domain/contracts/application/redemption-manager';
import type { MinistryInvitationRepository } from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type { RedemptionRepository } from '../domain/contracts/infrastructure/redemption.repository';
import type {
  CreateRedemptionAccountOutput,
  RedemptionIdentityGateway,
} from '../domain/contracts/infrastructure/redemption-identity-gateway';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VerificationCodeInspector } from '../domain/contracts/infrastructure/verification-code-inspector';
import { VerificationCodeError } from '../domain/errors/verification-code-error';

export interface DbRedemptionManagerDependencies {
  identityGateway: RedemptionIdentityGateway;
  invitationRepository: MinistryInvitationRepository;
  invitationVerificationCodeManager: InvitationVerificationCodeManager;
  redemptionRepository: RedemptionRepository;
  unitOfWork: UnitOfWork;
  /** Non-production only — see `getDebugVerificationCode`. */
  verificationCodeInspector?: VerificationCodeInspector;
}

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
    unitOfWork,
    verificationCodeInspector,
  }: DbRedemptionManagerDependencies) {
    this.identityGateway = identityGateway;
    this.invitationRepository = invitationRepository;
    this.invitationVerificationCodeManager = invitationVerificationCodeManager;
    this.redemptionRepository = redemptionRepository;
    this.unitOfWork = unitOfWork;
    this.verificationCodeInspector = verificationCodeInspector;
  }

  private readonly identityGateway: RedemptionIdentityGateway;
  private readonly invitationRepository: MinistryInvitationRepository;
  private readonly invitationVerificationCodeManager: InvitationVerificationCodeManager;
  private readonly redemptionRepository: RedemptionRepository;
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
  }: AcceptPendingMinistryInvitationInput): Promise<VolunteerId> {
    return this.unitOfWork.run((tx) =>
      this.redemptionRepository.acceptPendingMinistryInvitation({
        churchId,
        ministryInvitationId,
        userId,
        acceptedAt,
        correlationId: correlationId ?? crypto.randomUUID(),
        tx,
      }),
    );
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
