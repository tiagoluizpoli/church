import type { ChurchId } from '../../branded-ids';
import type { RegularActivity } from '../../entities/regular-activity';
import type { ChurchProgrammeRepository } from '@/domain/contracts/infrastructure/church-programme.repository';

export interface GetChurchProgrammeInput {
  churchId: ChurchId;
}

export interface IChurchProgrammeManager {
  getProgramme(input: GetChurchProgrammeInput): Promise<RegularActivity[]>;
}

export interface DbChurchProgrammeManagerDependencies {
  programmeRepository: ChurchProgrammeRepository;
}
