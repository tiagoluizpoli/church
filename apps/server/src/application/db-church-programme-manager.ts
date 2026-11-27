import type {
  DbChurchProgrammeManagerDependencies,
  GetChurchProgrammeInput,
  IChurchProgrammeManager,
} from '../domain/contracts/application/church-programme-manager';
import type { ChurchProgrammeRepository } from '../domain/contracts/infrastructure/church-programme.repository';
import type { RegularActivity } from '../domain/entities/regular-activity';

/** The Church Programme: live Regular Activities, no public endpoint yet. */
export class DbChurchProgrammeManager implements IChurchProgrammeManager {
  private readonly programmeRepository: ChurchProgrammeRepository;

  constructor({ programmeRepository }: DbChurchProgrammeManagerDependencies) {
    this.programmeRepository = programmeRepository;
  }

  getProgramme(input: GetChurchProgrammeInput): Promise<RegularActivity[]> {
    return this.programmeRepository.listRegularActivities(input);
  }
}
