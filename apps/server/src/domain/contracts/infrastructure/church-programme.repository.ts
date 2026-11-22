import type { ChurchId } from '../../branded-ids';
import type { RegularActivity } from '../../entities/regular-activity';

export interface ListRegularActivitiesInput {
  churchId: ChurchId;
}

export interface ChurchProgrammeRepository {
  /** Public TemplateTimeBlocks, ordered Sunday-first, then start time, then a stable tiebreak. */
  listRegularActivities(
    input: ListRegularActivitiesInput,
  ): Promise<RegularActivity[]>;
}
