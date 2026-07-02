import type { ChurchId, VolunteerId } from '../../branded-ids';
import type { Ministry } from '../../entities/ministry';

export interface IMinistryManager {
  listByLeader(input: {
    leaderId: VolunteerId;
    churchId: ChurchId;
  }): Promise<Ministry[]>;
}
