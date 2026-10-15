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

export interface ReplaceUsualSetupInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  entries: UsualSetupEntryInput[];
  tx?: TransactionContext;
}

export interface ListUsualSetupsByChurchInput {
  churchId: ChurchId;
  tx?: TransactionContext;
}

export interface UsualSetupRepository {
  listByMinistry(input: ListUsualSetupByMinistryInput): Promise<UsualSetup[]>;
  listByChurch(input: ListUsualSetupsByChurchInput): Promise<UsualSetup[]>;
  replaceForMinistry(input: ReplaceUsualSetupInput): Promise<UsualSetup[]>;
}
