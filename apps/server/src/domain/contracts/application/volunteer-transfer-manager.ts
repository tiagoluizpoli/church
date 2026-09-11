import type {
  MinistryInvitationId,
  UserId,
  VolunteerId,
} from '../../branded-ids';

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
  timeSlotStart: Date;
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
export interface VolunteerTransferManager {
  getTransferPreview(input: GetTransferPreviewInput): Promise<TransferPreview>;
  confirmTransfer(input: ConfirmTransferInput): Promise<ConfirmTransferOutcome>;
}
