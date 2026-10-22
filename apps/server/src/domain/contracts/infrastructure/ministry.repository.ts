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
  getById(input: GetMinistryByIdInput): Promise<Ministry>;

  listByChurch(input: ListMinistriesByChurchInput): Promise<Ministry[]>;

  getSettings(input: GetMinistrySettingsInput): Promise<MinistrySettings>;

  updateDefaultDirection(
    input: UpdateMinistryDefaultDirectionInput,
  ): Promise<Ministry>;
}

export interface GetMinistryByIdInput {
  churchId: ChurchId;
  id: MinistryId;
  tx?: TransactionContext;
}

export interface ListMinistriesByChurchInput {
  churchId: ChurchId;
  tx?: TransactionContext;
}

export interface GetMinistrySettingsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}
