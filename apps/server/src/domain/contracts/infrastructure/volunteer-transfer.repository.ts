import type {
  ChurchId,
  MinistryInvitationId,
  UserId,
  VolunteerId,
  VolunteerTransferId,
} from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

export interface GetTransferImpactInput {
  userId: UserId;
  sourceChurchId: ChurchId;
  /** Assignments whose time slot starts at or before this instant are already service performed and are left alone. */
  now: Date;
}

export interface AffectedMinistryMembership {
  ministryName: string;
}

export interface WithdrawnAssignmentPreview {
  eventName: string;
  timeSlotStart: Date;
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
export type ExecuteVolunteerTransferOutcome =
  | { kind: 'transferred'; result: VolunteerTransferResult }
  | { kind: 'already-transferred'; result: VolunteerTransferResult }
  | { kind: 'terminal-failure'; reason: 'INVITATION_UNAVAILABLE' };

export interface VolunteerTransferRepository {
  getTransferImpact(input: GetTransferImpactInput): Promise<TransferImpact>;
  /**
   * Steps 1–8 and 10–11 of spec §8.5, inside the caller's transaction. The
   * outbox enqueue (step 9/12) is issue #60 and is deliberately not done here.
   */
  executeTransfer(
    input: ExecuteVolunteerTransferInput,
  ): Promise<ExecuteVolunteerTransferOutcome>;
}
