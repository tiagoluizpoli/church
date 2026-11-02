import { nowAsDate } from '@church/time';
import type {
  ArchiveSectorInput,
  CreateSectorInput,
  ISectorManager,
  ListActiveSectorsInput,
  RenameSectorInput,
} from '../domain/contracts/application/sector-manager';
import type { SectorRepository } from '../domain/contracts/infrastructure/sector.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { Sector } from '../domain/entities/sector';
import { SectorInUseError } from '../domain/errors/sector-in-use';

interface DbSectorManagerDependencies {
  sectorRepository: SectorRepository;
  unitOfWork: UnitOfWork;
}

export class DbSectorManager implements ISectorManager {
  private readonly sectorRepository: SectorRepository;
  private readonly unitOfWork: UnitOfWork;

  constructor({ sectorRepository, unitOfWork }: DbSectorManagerDependencies) {
    this.sectorRepository = sectorRepository;
    this.unitOfWork = unitOfWork;
  }

  async list(input: ListActiveSectorsInput): Promise<Sector[]> {
    return this.sectorRepository.listByMinistry(input);
  }

  async create(input: CreateSectorInput): Promise<Sector> {
    return this.sectorRepository.create(input);
  }

  async rename(input: RenameSectorInput): Promise<Sector> {
    return this.sectorRepository.rename(input);
  }

  async archive(input: ArchiveSectorInput): Promise<void> {
    await this.unitOfWork.run(async (tx) => {
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
}
