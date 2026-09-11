import { injectable } from 'tsyringe';
import type {
  ChurchId,
  MinistryInvitationId,
  UserId,
} from '../domain/branded-ids';
import type {
  ConfirmTransferInput,
  ConfirmTransferOutcome,
  GetTransferPreviewInput,
  TransferPreview,
  VolunteerTransferManager,
} from '../domain/contracts/application/volunteer-transfer-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { MinistryInvitationRepository } from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type { RedemptionIdentityGateway } from '../domain/contracts/infrastructure/redemption-identity-gateway';
import type { SecurityLogRepository } from '../domain/contracts/infrastructure/security-log.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { VolunteerTransferRepository } from '../domain/contracts/infrastructure/volunteer-transfer.repository';
import type { MinistryInvitation } from '../domain/entities/ministry-invitation';

export interface DbVolunteerTransferManagerDependencies {
  churchRepository: ChurchRepository;
  identityGateway: RedemptionIdentityGateway;
  invitationRepository: MinistryInvitationRepository;
  securityLogRepository: SecurityLogRepository;
  unitOfWork: UnitOfWork;
  volunteerRepository: VolunteerRepository;
  volunteerTransferRepository: VolunteerTransferRepository;
}

type ResolvedTransferContext =
  | { status: 'unavailable' }
  | { status: 'identity-mismatch' }
  | { status: 'no-transfer-needed' }
  | {
      status: 'ready';
      ministryInvitation: MinistryInvitation;
      /** The intended addressee's own email (spec: existing-member invitations carry the User's email). */
      email: string;
      destinationChurchName: string;
      sourceChurchId: ChurchId;
    };

interface ResolveTransferContextInput {
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  now: Date;
}

interface RecordMismatchInput {
  churchId: ChurchId;
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  correlationId: string;
  now: Date;
}

/**
 * Volunteer Transfer (spec §8), reachable only from invitation redemption.
 * Layer 2 is `getTransferPreview`; layer 3 is `confirmTransfer` — exact
 * destination-name match, then server-side password verification issuing no
 * session, then the one transaction that retires one profile and births
 * another. A former-Church actor has no input here by construction.
 */
@injectable()
export class DbVolunteerTransferManager implements VolunteerTransferManager {
  constructor({
    churchRepository,
    identityGateway,
    invitationRepository,
    securityLogRepository,
    unitOfWork,
    volunteerRepository,
    volunteerTransferRepository,
  }: DbVolunteerTransferManagerDependencies) {
    this.churchRepository = churchRepository;
    this.identityGateway = identityGateway;
    this.invitationRepository = invitationRepository;
    this.securityLogRepository = securityLogRepository;
    this.unitOfWork = unitOfWork;
    this.volunteerRepository = volunteerRepository;
    this.volunteerTransferRepository = volunteerTransferRepository;
  }

  private readonly churchRepository: ChurchRepository;
  private readonly identityGateway: RedemptionIdentityGateway;
  private readonly invitationRepository: MinistryInvitationRepository;
  private readonly securityLogRepository: SecurityLogRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly volunteerRepository: VolunteerRepository;
  private readonly volunteerTransferRepository: VolunteerTransferRepository;

  async getTransferPreview({
    ministryInvitationId,
    userId,
    now = new Date(),
  }: GetTransferPreviewInput): Promise<TransferPreview> {
    const resolved = await this.resolveTransferContext({
      ministryInvitationId,
      userId,
      now,
    });
    if (resolved.status === 'unavailable') return { kind: 'unavailable' };
    if (resolved.status === 'identity-mismatch') {
      return { kind: 'identity-mismatch' };
    }
    if (resolved.status === 'no-transfer-needed') {
      return { kind: 'no-transfer-needed' };
    }

    const impact = await this.volunteerTransferRepository.getTransferImpact({
      userId,
      sourceChurchId: resolved.sourceChurchId,
      now,
    });
    const sourceChurch = await this.churchRepository.getById({
      id: resolved.sourceChurchId,
    });
    return {
      kind: 'reviewable',
      sourceChurchName: sourceChurch.name,
      destinationChurchName: resolved.destinationChurchName,
      endedMemberships: impact.endedMemberships.map(({ ministryName }) => ({
        ministryName,
      })),
      withdrawnAssignments: impact.withdrawnAssignments.map((assignment) => ({
        eventName: assignment.eventName,
        timeSlotStart: assignment.timeSlotStart,
        roleName: assignment.roleName,
      })),
    };
  }

  async confirmTransfer({
    ministryInvitationId,
    userId,
    destinationChurchName,
    password,
    idempotencyKey,
    now = new Date(),
  }: ConfirmTransferInput): Promise<ConfirmTransferOutcome> {
    const resolved = await this.resolveTransferContext({
      ministryInvitationId,
      userId,
      now,
    });
    if (resolved.status === 'unavailable') {
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    }
    if (resolved.status === 'identity-mismatch') {
      return { kind: 'identity-mismatch' };
    }
    if (resolved.status === 'no-transfer-needed') {
      return { kind: 'terminal-failure', reason: 'NO_TRANSFER_NEEDED' };
    }

    // Layer 3: the destination Church name is typed back verbatim, then the
    // password is proved server-side. Either failure records to the security
    // log and changes nothing.
    if (destinationChurchName.trim() !== resolved.destinationChurchName) {
      await this.recordMismatch({
        churchId: resolved.ministryInvitation.churchId,
        ministryInvitationId,
        userId,
        correlationId: idempotencyKey,
        now,
      });
      return { kind: 'name-mismatch' };
    }
    const passwordValid = await this.identityGateway.verifyPassword({
      email: resolved.email,
      password,
    });
    if (!passwordValid) {
      await this.recordMismatch({
        churchId: resolved.ministryInvitation.churchId,
        ministryInvitationId,
        userId,
        correlationId: idempotencyKey,
        now,
      });
      return { kind: 'password-mismatch' };
    }

    const outcome = await this.unitOfWork.run((tx) =>
      this.volunteerTransferRepository.executeTransfer({
        userId,
        ministryInvitationId,
        sourceChurchId: resolved.sourceChurchId,
        destinationChurchId: resolved.ministryInvitation.churchId,
        confirmedAt: now,
        correlationId: idempotencyKey,
        tx,
      }),
    );
    if (outcome.kind === 'terminal-failure') {
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    }
    return {
      kind: outcome.kind,
      destinationVolunteerId: outcome.result.destinationVolunteerId,
    };
  }

  private async resolveTransferContext({
    ministryInvitationId,
    userId,
    now,
  }: ResolveTransferContextInput): Promise<ResolvedTransferContext> {
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
    if (!addressed) return { status: 'identity-mismatch' };

    const { ministryInvitation } = context;
    if (
      ministryInvitation.status !== 'pending' ||
      ministryInvitation.expiresAt <= now
    ) {
      return { status: 'unavailable' };
    }

    const activeProfile =
      await this.volunteerRepository.findByUserIdGlobally(userId);
    if (
      !activeProfile ||
      activeProfile.churchId === ministryInvitation.churchId
    ) {
      return { status: 'no-transfer-needed' };
    }

    return {
      status: 'ready',
      ministryInvitation,
      email: context.email,
      destinationChurchName: context.churchName,
      sourceChurchId: activeProfile.churchId,
    };
  }

  private async recordMismatch({
    churchId,
    ministryInvitationId,
    userId,
    correlationId,
    now,
  }: RecordMismatchInput): Promise<void> {
    await this.securityLogRepository.recordIdentityMismatch({
      churchId,
      ministryInvitationId,
      actorId: userId,
      correlationId,
      now,
    });
  }
}
