import type { ChurchId, MinistryId, VolunteerId } from '../../branded-ids';
import type { DefaultDirection, Ministry } from '../../entities/ministry';

export interface ListMinistriesByLeaderInput {
  leaderId: VolunteerId;
  churchId: ChurchId;
}

export interface SetDefaultDirectionInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  defaultDirection: DefaultDirection;
}

export interface IMinistryManager {
  listByLeader(input: ListMinistriesByLeaderInput): Promise<Ministry[]>;
  setDefaultDirection(input: SetDefaultDirectionInput): Promise<Ministry>;
}
