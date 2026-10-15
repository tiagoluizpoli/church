import type { ChurchId, MinistryId, SectorId } from '../../branded-ids';
import type { Sector } from '../../entities/sector';
import type { TransactionContext } from './transaction-context';

export interface ListSectorsByMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export interface GetSectorInput {
  churchId: ChurchId;
  sectorId: SectorId;
  tx?: TransactionContext;
}

export interface SectorRepository {
  /** The Ministry's Sectors, ordered by name. */
  listByMinistry(input: ListSectorsByMinistryInput): Promise<Sector[]>;
  /** Throws `NotFoundError` when the Sector is not in the Church. */
  getById(input: GetSectorInput): Promise<Sector>;
}
