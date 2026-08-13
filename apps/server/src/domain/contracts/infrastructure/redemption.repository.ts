import type {
  ChurchId,
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

export interface RedemptionRepository {
  acceptPendingMinistryInvitation(
    input: AcceptMinistryInvitationInput,
  ): Promise<VolunteerId>;
  /** Persists the reject + its 'decline' audit row together; throws if the invitation is not `pending`. */
  declineMinistryInvitation(
    input: DeclineMinistryInvitationInput,
  ): Promise<void>;
}
