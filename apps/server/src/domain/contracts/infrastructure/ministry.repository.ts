import type { ChurchId } from '../../entities/church';
import type {
  Ministry,
  MinistryId,
  MinistrySettings,
} from '../../entities/ministry';
import type { TransactionContext } from './transaction-context';

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
}
