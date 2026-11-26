import type { ChurchId } from '../../branded-ids';
import type { RegularActivity } from '../../entities/regular-activity';

export interface GetChurchProgrammeInput {
  churchId: ChurchId;
}

export interface IChurchProgrammeManager {
  getProgramme(input: GetChurchProgrammeInput): Promise<RegularActivity[]>;
}
