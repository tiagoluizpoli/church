import type { ChurchId, MinistryId, SectorId } from '../../branded-ids';
import type { Sector } from '../../entities/sector';

export interface ListActiveSectorsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
}

export interface CreateSectorInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
}

export interface RenameSectorInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  sectorId: SectorId;
  name: string;
}

export interface ArchiveSectorInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  sectorId: SectorId;
}

/**
 * A Ministry's Sector registry. Callers have already admitted the manager; an
 * archived Ministry, or a Sector outside it, is not found.
 */
export interface ISectorManager {
  /** Active Sectors, alphabetical ignoring case. */
  list(input: ListActiveSectorsInput): Promise<Sector[]>;
  /** `SectorNameInUseError` when an active Sector of the Ministry has the name, ignoring case. */
  create(input: CreateSectorInput): Promise<Sector>;
  /** Renames the identity, so history shows the new name too. */
  rename(input: RenameSectorInput): Promise<Sector>;
  /** `SectorInUseError` while upcoming requirements or a UsualSetup use it. */
  archive(input: ArchiveSectorInput): Promise<void>;
}
