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

export interface GetActiveMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
}

export interface CreateMinistryInput {
  churchId: ChurchId;
  name: string;
}

export interface RenameMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
}

export interface ArchiveMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
}

export interface IMinistryManager {
  /** Active Ministries of the Church, alphabetical ignoring case. */
  listByChurch(churchId: ChurchId): Promise<Ministry[]>;
  /** Active Ministries the leader leads, alphabetical ignoring case. */
  listByLeader(input: ListMinistriesByLeaderInput): Promise<Ministry[]>;
  /** `NotFoundError` for an archived, missing or other-Church Ministry. */
  getActive(input: GetActiveMinistryInput): Promise<Ministry>;
  /** `MinistryNameInUseError` when an active Ministry has the name, ignoring case. */
  create(input: CreateMinistryInput): Promise<Ministry>;
  /** Same identity, new name; refusals as `getActive` and `create`. */
  rename(input: RenameMinistryInput): Promise<Ministry>;
  /**
   * Archives an active Ministry: `MinistryInUseError` while it participates
   * in an Event that has not ended; refusals otherwise as `getActive`.
   */
  archive(input: ArchiveMinistryInput): Promise<void>;
  setDefaultDirection(input: SetDefaultDirectionInput): Promise<Ministry>;
}
