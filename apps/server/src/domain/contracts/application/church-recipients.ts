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

export interface EventChangedRecipientsInput {
  tx: TransactionContext;
  churchId: ChurchId;
  /** The Ministries the change affects. */
  ministryIds: MinistryId[];
  /** The acting admin: left out of the leaderless fallback only. */
  actingUserId: UserId;
}

/** One recipient with every affected Ministry they are told about. */
export interface EventChangedRecipient extends ChurchRecipient {
  ministryIds: MinistryId[];
}

export interface IChurchRecipients {
  /**
   * Per affected Ministry, its active leaders; a leaderless Ministry falls
   * back to every ChurchAdmin except `actingUserId` (who still counts when
   * they lead). Merged by User, so one admin action yields one recipient row.
   */
  eventChangedRecipients(
    input: EventChangedRecipientsInput,
  ): Promise<EventChangedRecipient[]>;

  /**
   * The Ministry's active leaders; the Church's ChurchAdmins only when it has
   * none (decided before `excludeUserId` is applied). Deduplicated by User and
   * scoped to `churchId` throughout.
   */
  ministryLeadersOrAdmins(
    input: MinistryLeadersOrAdminsInput,
  ): Promise<ChurchRecipient[]>;
}
