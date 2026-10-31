import type {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  UserId,
  VolunteerId,
  VolunteerTransferId,
} from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

export interface GetTransferImpactInput {
  userId: UserId;
  sourceChurchId: ChurchId;
  /** Assignments whose event time block starts at or before this instant are already service performed and are left alone. */
  now: Date;
}

export interface AffectedMinistryMembership {
  ministryName: string;
}

export interface WithdrawnAssignmentPreview {
  eventName: string;
  eventTimeBlockStart: Date;
  roleName: string;
}

/**
 * Spec §8.7 layer 2: the *actual* rows a transfer would retire or withdraw,
 * for the review-and-acknowledge screen. Advisory only — the transaction
 * re-derives everything against the commit instant.
 */
export interface TransferImpact {
  endedMemberships: AffectedMinistryMembership[];
  withdrawnAssignments: WithdrawnAssignmentPreview[];
}

export interface ExecuteVolunteerTransferInput {
  userId: UserId;
  ministryInvitationId: MinistryInvitationId;
  sourceChurchId: ChurchId;
  destinationChurchId: ChurchId;
  /** The transfer commit instant — the strict cut for assignment cancellation (§8.4). */
  confirmedAt: Date;
  correlationId: string;
  tx: TransactionContext;
}

export interface VolunteerTransferResult {
  volunteerTransferId: VolunteerTransferId;
  sourceVolunteerId: VolunteerId;
  destinationVolunteerId: VolunteerId;
  withdrawnAssignmentCount: number;
  endedMembershipCount: number;
}

/**
 * `already-transferred` is the idempotent replay (spec §8.6): the
 * `(userId, ministryInvitationId)` row already exists, so the original result
 * is returned and nothing is written. `terminal-failure` means the Ministry
 * Invitation is no longer `pending`/unexpired and nothing changed (§8.5 step 2).
 */
export type TransferDigestKind =
  | 'transfer_ministry_digest'
  | 'transfer_leaderless_ministry';

/**
 * One affected Ministry's digest and its intended Users, selected inside the
 * transfer transaction after the memberships ended (issue #60): the
 * remaining active leaders, or every ChurchAdmin when the departing
 * Volunteer was that Ministry's last active leader.
 */
export interface TransferDigest {
  kind: TransferDigestKind;
  ministryId: MinistryId;
  recipientUserIds: UserId[];
}

export type ExecuteVolunteerTransferOutcome =
  | {
      kind: 'transferred';
      result: VolunteerTransferResult;
      digests: TransferDigest[];
    }
  | { kind: 'already-transferred'; result: VolunteerTransferResult }
  | { kind: 'terminal-failure'; reason: 'INVITATION_UNAVAILABLE' };

export interface GetTransferDigestDetailsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  volunteerId: VolunteerId;
  correlationId: string;
}

/**
 * Rendered at send time (spec §4.3) from the ids an outbox row's payload
 * carries — `volunteerName` reads the *retired* source profile's User (never
 * deleted, so still resolvable), and `withdrawnAssignments` is re-derived
 * from `assignment_audit` by `correlationId`, scoped to this one Ministry, not
 * duplicated onto the outbox row itself.
 */
export interface TransferDigestDetails {
  ministryName: string;
  volunteerName: string;
  withdrawnAssignments: WithdrawnAssignmentPreview[];
}

export interface VolunteerTransferRepository {
  getTransferImpact(input: GetTransferImpactInput): Promise<TransferImpact>;
  /**
   * Steps 1–9 and 11–12 of spec §8.5, inside the caller's transaction. It
   * selects each affected Ministry's digest recipients but enqueues nothing:
   * the caller hands them to the Church notification boundary in the same
   * transaction.
   */
  executeTransfer(
    input: ExecuteVolunteerTransferInput,
  ): Promise<ExecuteVolunteerTransferOutcome>;

  /** Content for a transfer digest send, either kind (issue #60). */
  getDigestDetails(
    input: GetTransferDigestDetailsInput,
  ): Promise<TransferDigestDetails>;
}
