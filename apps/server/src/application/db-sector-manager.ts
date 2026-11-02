import { nowAsDate } from '@church/time';
import type { ChurchId, MinistryId } from '../domain/branded-ids';
import type {
  ArchiveSectorInput,
  CreateSectorInput,
  ISectorManager,
  ListActiveSectorsInput,
  RenameSectorInput,
} from '../domain/contracts/application/sector-manager';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { SectorRepository } from '../domain/contracts/infrastructure/sector.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { Sector } from '../domain/entities/sector';
import { SectorInUseError } from '../domain/errors/sector-in-use';

interface DbSectorManagerDependencies {
  ministryRepository: MinistryRepository;
  sectorRepository: SectorRepository;
  unitOfWork: UnitOfWork;
}

export class DbSectorManager implements ISectorManager {
  private readonly ministryRepository: MinistryRepository;
  private readonly sectorRepository: SectorRepository;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    ministryRepository,
    sectorRepository,
    unitOfWork,
  }: DbSectorManagerDependencies) {
    this.ministryRepository = ministryRepository;
    this.sectorRepository = sectorRepository;
    this.unitOfWork = unitOfWork;
  }

  async list(input: ListActiveSectorsInput): Promise<Sector[]> {
    return this.sectorRepository.listByMinistry(input);
  }

  async create(input: CreateSectorInput): Promise<Sector> {
    return this.unitOfWork.run(async (tx) => {
      await this.lockActiveMinistry({ ...input, tx });
      return this.sectorRepository.create({ ...input, tx });
    });
  }

  async rename(input: RenameSectorInput): Promise<Sector> {
    return this.unitOfWork.run(async (tx) => {
      await this.lockActiveMinistry({ ...input, tx });
      return this.sectorRepository.rename({ ...input, tx });
    });
  }

  async archive(input: ArchiveSectorInput): Promise<void> {
    await this.unitOfWork.run(async (tx) => {
      await this.lockActiveMinistry({ ...input, tx });
      // The lock is taken first so the guard reads every committed new use.
      await this.sectorRepository.lockForArchive({ ...input, tx });
      const blockers = await this.sectorRepository.listArchiveBlockers({
        churchId: input.churchId,
        sectorId: input.sectorId,
        now: nowAsDate(),
        tx,
      });
      if (blockers.length > 0) throw new SectorInUseError({ blockers });
      await this.sectorRepository.markArchived({ ...input, tx });
    });
  }

  // An archived Ministry is not found; the share lock serializes with its archive.
  private async lockActiveMinistry({
    churchId,
    ministryId,
    tx,
  }: LockActiveMinistryInput): Promise<void> {
    await this.ministryRepository.lockActive({
      churchId,
      ministryId,
      strength: 'share',
      tx,
    });
  }
}

interface LockActiveMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx: TransactionContext;
}
