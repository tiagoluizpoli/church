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
  /**
   * Spec §7.5/§7.6: one `church_only_partial_acceptance` audit row for the
   * cross-Church split. Writes nothing else — the Ministry Invitation stays
   * `pending` and no grant, outbox row or Volunteer profile is created.
   */
  recordChurchOnlyPartialAcceptance(
    input: RecordChurchOnlyPartialAcceptanceInput,
  ): Promise<void>;
}
