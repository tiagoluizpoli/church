import type {
  ChurchId,
  MinistryInvitationId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

export interface AcceptMinistryInvitationInput {
  churchId: ChurchId;
  ministryInvitationId: MinistryInvitationId;
  userId: UserId;
  acceptedAt: Date;
  tx: TransactionContext;
}

export interface RedemptionRepository {
  acceptPendingMinistryInvitation(
    input: AcceptMinistryInvitationInput,
  ): Promise<VolunteerId>;
}
