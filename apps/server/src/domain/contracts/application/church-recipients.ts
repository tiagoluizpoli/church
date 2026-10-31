import type { ChurchId, MinistryId, UserId } from '../../branded-ids';
import type { ChurchRecipient } from './church-notifications';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';

export interface MinistryLeadersOrAdminsInput {
  /** The change's own transaction, so the set matches what the change commits. */
  tx: TransactionContext;
  churchId: ChurchId;
  ministryId: MinistryId;
  /** The acting User, left out of the result (applied after the fallback). */
  excludeUserId?: UserId;
}

export interface IChurchRecipients {
  /**
   * The Ministry's active leaders; the Church's ChurchAdmins only when it has
   * none (decided before `excludeUserId` is applied). Deduplicated by User and
   * scoped to `churchId` throughout.
   */
  ministryLeadersOrAdmins(
    input: MinistryLeadersOrAdminsInput,
  ): Promise<ChurchRecipient[]>;
}
