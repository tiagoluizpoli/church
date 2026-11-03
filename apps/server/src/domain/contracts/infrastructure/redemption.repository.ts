import type {
  ChurchId,
  ChurchInvitationId,
  MinistryInvitationId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

/** Which audit act this checkpoint-three grant represents (spec §7.6). */
export type MinistryAcceptanceAuditAction =
  | 'acceptance'
  | 'ministry_acceptance';

export interface AcceptMinistryInvitationInput {
  churchId: ChurchId;
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  acceptedAt: Date;
  correlationId: string;
  auditAction: MinistryAcceptanceAuditAction;
  tx: TransactionContext;
}

export interface LockInvitedMinistriesInput {
  churchId: ChurchId;
  ministryInvitationIds: MinistryInvitationId[];
  tx: TransactionContext;
}

export interface DeclineMinistryInvitationInput {
  churchId: ChurchId;
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  declinedAt: Date;
  correlationId: string;
  tx: TransactionContext;
}

export interface DeclineChurchInvitationInput {
  churchInvitationId: ChurchInvitationId;
  declinedAt: Date;
  tx: TransactionContext;
}

/** `unavailable`: missing, expired, canceled or accepted — nothing was changed. */
export type DeclineChurchInvitationResult =
  | 'declined'
  | 'already-declined'
  | 'unavailable';

export interface RecordChurchInvitationAcceptanceInput {
  churchInvitationId: ChurchInvitationId;
  userId: UserId;
  acceptedAt: Date;
  tx: TransactionContext;
}

export interface RecordChurchOnlyPartialAcceptanceInput {
  /** The invitation's Church — where Church Membership was granted. */
  churchId: ChurchId;
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  correlationId: string;
  recordedAt: Date;
  tx: TransactionContext;
}

export interface RedemptionRepository {
  /**
   * Share-locks the Ministry rows the invitations grant, in id order, before
   * any invitation row: the lock order a Ministry archive shares
   * (`MinistryInvitationRepository.acquireChurchOfferLock`). Archived rows
   * are skipped, never refused here.
   */
  lockInvitedMinistries(input: LockInvitedMinistriesInput): Promise<void>;
  acceptPendingMinistryInvitation(
    input: AcceptMinistryInvitationInput,
  ): Promise<VolunteerId>;
  /** Persists the reject + its 'decline' audit row together; throws if the invitation is not `pending`. */
  declineMinistryInvitation(
    input: DeclineMinistryInvitationInput,
  ): Promise<void>;
  /**
   * Public decline: rejects a pending Church Invitation, every pending paired
   * Ministry half and the verification code together. Writes no audit row
   * (no User exists to act) and no notification.
   */
  declineChurchInvitation(
    input: DeclineChurchInvitationInput,
  ): Promise<DeclineChurchInvitationResult>;
  /** Stamps who accepted and when on a Church Invitation Better Auth just accepted; keeps any earlier stamp. */
  recordChurchInvitationAcceptance(
    input: RecordChurchInvitationAcceptanceInput,
  ): Promise<void>;
  /**
   * Spec §7.5/§7.6: one `church_only_partial_acceptance` audit row for the
   * cross-Church split. Writes nothing else — the Ministry Invitation stays
   * `pending` and no grant, outbox row or Volunteer profile is created.
   */
  recordChurchOnlyPartialAcceptance(
    input: RecordChurchOnlyPartialAcceptanceInput,
  ): Promise<void>;
}
