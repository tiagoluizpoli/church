import type { Instant } from '@church/time';
import type { ArchiveBlocker } from '../../archive-blockers';
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

export interface LockActiveSectorsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  sectorIds: SectorId[];
  tx: TransactionContext;
}

export interface CreateSectorRecordInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
  tx?: TransactionContext;
}

export interface RenameSectorRecordInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  sectorId: SectorId;
  name: string;
  tx?: TransactionContext;
}

export interface SectorArchiveInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  sectorId: SectorId;
  tx: TransactionContext;
}

export interface ListSectorArchiveBlockersInput {
  churchId: ChurchId;
  sectorId: SectorId;
  /** Requirements of Events ending after this moment block. */
  now: Instant;
  tx: TransactionContext;
}

export interface SectorRepository {
  /** The Ministry's active Sectors, the choices for new use, ordered by name. */
  listByMinistry(input: ListSectorsByMinistryInput): Promise<Sector[]>;
  /** Any Sector of the Church, archived too, for historical reads. Throws `NotFoundError` when absent. */
  getById(input: GetSectorInput): Promise<Sector>;
  /**
   * Share-locks the given Sectors that are active in the Ministry until `tx`
   * ends, so a concurrent archive waits for this write (and sees its new use)
   * or wins first (and they are no longer returned). Returns the locked ids.
   */
  lockActive(input: LockActiveSectorsInput): Promise<Set<SectorId>>;
  /** Throws `SectorNameInUseError` when an active Sector of the Ministry has the name, ignoring case. */
  create(input: CreateSectorRecordInput): Promise<Sector>;
  /** An active Sector of the Ministry only; else `NotFoundError`. Same name errors as `create`. */
  rename(input: RenameSectorRecordInput): Promise<Sector>;
  /** Locks an active Sector of the Ministry for archive until `tx` ends; else `NotFoundError`. */
  lockActiveForArchive(input: SectorArchiveInput): Promise<Sector>;
  /** Upcoming requirement and UsualSetup locations, one per block. */
  listArchiveBlockers(
    input: ListSectorArchiveBlockersInput,
  ): Promise<ArchiveBlocker[]>;
  markArchived(input: SectorArchiveInput): Promise<void>;
}
