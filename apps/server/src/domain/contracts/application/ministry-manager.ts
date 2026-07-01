import type { ChurchId } from '../../entities/church';
import type { Ministry } from '../../entities/ministry';
import type { VolunteerId } from '../../entities/volunteer';

export interface IMinistryManager {
  listByLeader(input: {
    leaderId: VolunteerId;
    churchId: ChurchId;
  }): Promise<Ministry[]>;
}
