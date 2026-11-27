import type {
  ChurchId,
  MinistryInvitationId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { MinistryInvitation } from '../../entities/ministry-invitation';
import type { IChurchNotifications } from '@/domain/contracts/application/church-notifications';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { MinistryInvitationRepository } from '@/domain/contracts/infrastructure/ministry-invitation.repository';
import type { RedemptionIdentityGateway } from '@/domain/contracts/infrastructure/redemption-identity-gateway';
import type { SecurityLogRepository } from '@/domain/contracts/infrastructure/security-log.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '@/domain/contracts/infrastructure/volunteer.repository';
import type { VolunteerTransferRepository } from '@/domain/contracts/infrastructure/volunteer-transfer.repository';

export interface GetTransferPreviewInput {
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  now?: Date;
}

export interface TransferPreviewMembership {
  ministryName: string;
}

export interface TransferPreviewAssignment {
  eventName: string;
  eventTimeBlockStart: Date;
  roleName: string;
}

/**
 * Spec §8.7 layer 2: the review-and-acknowledge screen, populated with the
 * *actual* rows the transfer would touch.
 */
export interface ReviewableTransferPreview {
  kind: 'reviewable';
  sourceChurchName: string;
  destinationChurchName: string;
  endedMemberships: TransferPreviewMembership[];
  withdrawnAssignments: TransferPreviewAssignment[];
}

export type TransferPreview =
  | ReviewableTransferPreview
  | { kind: 'unavailable' }
  | { kind: 'identity-mismatch' }
  /** No active Volunteer profile in another Church — there is nothing to transfer. */
  | { kind: 'no-transfer-needed' };

export interface ConfirmTransferInput {
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  /** Must exactly match the destination Church's name (spec §8.7 layer 3). */
  destinationChurchName: string;
  password: string;
  idempotencyKey: string;
  now?: Date;
}

export type ConfirmTransferOutcome =
  | { kind: 'transferred'; destinationVolunteerId: VolunteerId }
  /** Idempotent replay (spec §8.6): the original transfer's result, nothing new written. */
  | { kind: 'already-transferred'; destinationVolunteerId: VolunteerId }
  | { kind: 'password-mismatch' }
  | { kind: 'name-mismatch' }
  | { kind: 'identity-mismatch' }
  | {
      kind: 'terminal-failure';
      reason: 'INVITATION_UNAVAILABLE' | 'NO_TRANSFER_NEEDED';
    };

/**
 * Volunteer Transfer (spec §8), reachable only from invitation redemption
 * (§8.9). `getTransferPreview` backs confirmation layer 2; `confirmTransfer`
 * is layer 3 — name match, then server-side password verification issuing no
 * session, then the single transaction.
 */
export interface IVolunteerTransferManager {
  getTransferPreview(input: GetTransferPreviewInput): Promise<TransferPreview>;
  confirmTransfer(input: ConfirmTransferInput): Promise<ConfirmTransferOutcome>;
}

export interface DbVolunteerTransferManagerDependencies {
  churchRepository: ChurchRepository;
  identityGateway: RedemptionIdentityGateway;
  invitationRepository: MinistryInvitationRepository;
  notifications: IChurchNotifications;
  securityLogRepository: SecurityLogRepository;
  unitOfWork: UnitOfWork;
  volunteerRepository: VolunteerRepository;
  volunteerTransferRepository: VolunteerTransferRepository;
}

export type ResolvedTransferContext =
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

export interface ResolveTransferContextInput {
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  now: Date;
}

export interface RecordMismatchInput {
  churchId: ChurchId;
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  correlationId: string;
  now: Date;
}
