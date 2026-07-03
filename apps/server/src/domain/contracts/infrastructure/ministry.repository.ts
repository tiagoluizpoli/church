import type { ChurchId, MinistryId } from '../../branded-ids';
import type {
  DefaultDirection,
  Ministry,
  MinistrySettings,
} from '../../entities/ministry';
import type { TransactionContext } from './transaction-context';

export interface UpdateMinistryDefaultDirectionInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  defaultDirection: DefaultDirection;
  tx?: TransactionContext;
}

export interface MinistryRepository {
  getById(
    churchId: ChurchId,
    id: MinistryId,
    tx?: TransactionContext,
  ): Promise<Ministry>;

  listByChurch(
    churchId: ChurchId,
    tx?: TransactionContext,
  ): Promise<Ministry[]>;

  getSettings(
    churchId: ChurchId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<MinistrySettings>;

  updateDefaultDirection(
    input: UpdateMinistryDefaultDirectionInput,
  ): Promise<Ministry>;
}
