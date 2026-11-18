import type {
  ChurchId,
  MinistryId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type {
  DefaultDirection,
  Ministry,
  MinistryListCounts,
  MinistryListStatus,
} from '../../entities/ministry';

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
  /** The archiving ChurchAdmin, recorded on every invitation the archive revokes. */
  callerId: UserId;
}

export interface MinistrySummary {
  /** Active (not archived) Sectors, as the Sectors tab lists them. */
  sectorCount: number;
  /** Active (not archived) Roles, as the Roles tab lists them. */
  roleCount: number;
  /** Any Usual setup block of the Ministry needs review. */
  needsReview: boolean;
}

export interface SummarizeMinistriesInput {
  churchId: ChurchId;
  ministries: Ministry[];
}

export interface ListMinistryPageRequest {
  churchId: ChurchId;
  /** A leader's Ministries; the whole Church for a ChurchAdmin. Resolved by the controller. */
  ministryIds?: MinistryId[];
  search?: string;
  status: MinistryListStatus;
  cursor?: string;
  limit: number;
}

export interface MinistryPage {
  ministries: Ministry[];
  /** One entry per listed Ministry. */
  summaries: Map<MinistryId, MinistrySummary>;
  nextCursor?: string;
  counts: MinistryListCounts;
}

export interface IMinistryManager {
  /** A fixed number of queries whatever the list size; one entry per given Ministry. */
  summarize(
    input: SummarizeMinistriesInput,
  ): Promise<Map<MinistryId, MinistrySummary>>;
  /** The Ministries management page: filtered, paginated, with whole-scope counts. */
  listPage(input: ListMinistryPageRequest): Promise<MinistryPage>;
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
   * Revokes the Ministry's pending invitations in the same transaction.
   */
  archive(input: ArchiveMinistryInput): Promise<void>;
  setDefaultDirection(input: SetDefaultDirectionInput): Promise<Ministry>;
}
