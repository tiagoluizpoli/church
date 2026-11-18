import type { ChurchId, MinistryId } from '../../branded-ids';
import type {
  UsualSetup,
  UsualSetupEntryInput,
} from '../../entities/usual-setup';
import type { TransactionContext } from './transaction-context';

export interface ListUsualSetupByMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export interface UpsertUsualSetupBlockInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  entry: UsualSetupEntryInput;
  tx?: TransactionContext;
}

export interface ListUsualSetupsByChurchInput {
  churchId: ChurchId;
  tx?: TransactionContext;
}

export interface UsualSetupRepository {
  listByMinistry(input: ListUsualSetupByMinistryInput): Promise<UsualSetup[]>;
  listByChurch(input: ListUsualSetupsByChurchInput): Promise<UsualSetup[]>;
  /** Inserts or replaces this one block's entry; other blocks stay untouched. */
  upsertBlock(input: UpsertUsualSetupBlockInput): Promise<UsualSetup>;
}
