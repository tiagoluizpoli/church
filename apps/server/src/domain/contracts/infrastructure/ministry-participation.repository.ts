import type { Instant } from '@church/time';
import type {
  ChurchId,
  CycleId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  VolunteerId,
} from '../../branded-ids';
import type { AssignmentStatus } from '../../entities/assignment';
import type { Cycle, CycleState } from '../../entities/cycle';
import type { Event } from '../../entities/event';
import type { Ministry } from '../../entities/ministry';
import type {
  MinistryParticipation,
  ParticipationState,
  ScheduleStage,
} from '../../entities/ministry-participation';
import type { ParticipationEventTimeBlockInclusion } from '../../entities/participation-event-time-block-inclusion';
import type { ScheduleAssignmentSnapshot } from '../../schedule-last-told';
import type { ScheduleListPosition } from '../../schedule-list-cursor';
import type { TransactionContext } from './transaction-context';

export interface GetParticipationInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  tx?: TransactionContext;
}

export interface LockParticipationInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  tx: TransactionContext;
}

export interface LockScheduleParticipationsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: CycleId;
  tx: TransactionContext;
}

export interface FindParticipationByMinistryEventInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface CreateParticipationInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface ListParticipationsByEventInput {
  churchId: ChurchId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface ListParticipationsByMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  state?: ParticipationState;
  tx?: TransactionContext;
}

export interface ListParticipationsByMinistriesInput {
  churchId: ChurchId;
  ministryIds: MinistryId[];
  state?: ParticipationState;
  tx?: TransactionContext;
}

export interface ListParticipationsByIdsInput {
  churchId: ChurchId;
  participationIds: MinistryParticipationId[];
  tx?: TransactionContext;
}

export interface UpdateParticipationStateInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  state: ParticipationState;
  tx?: TransactionContext;
}

export interface HasCycleStaffingInput {
  churchId: ChurchId;
  cycleId: CycleId;
  tx?: TransactionContext;
}

export interface ListInclusionsInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  tx?: TransactionContext;
}

export interface AddInclusionInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  eventTimeBlockId: EventTimeBlockId;
  tx?: TransactionContext;
}

export interface RemoveInclusionInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  eventTimeBlockId: EventTimeBlockId;
  tx?: TransactionContext;
}

export interface FindAvailabilityRequestedAtInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export interface TouchParticipationInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  tx?: TransactionContext;
}

export interface ListScheduleSummariesInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

/** Iteration 3 (research.md R15/R16): one row per sent `Cycle`
 * church-wide, annotated with this ministry's participation data. A cycle
 * the ministry has zero events in still appears, with `isPartOf: false`. */
export interface ScheduleSummaryRow {
  cycleId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isPartOf: boolean;
  eventCount: number;
  eventTimeBlockCount: number;
  status: 'not_started' | 'in_progress' | 'published';
  availabilityRequestedForAll: boolean;
  availabilityRequestedForAny: boolean;
}

export interface ListScheduleRowsInput {
  churchId: ChurchId;
  /** The led Ministries a leader is scoped to; omitted for a ChurchAdmin. */
  ministryIds?: MinistryId[];
  ministryId?: MinistryId;
  cycleId?: CycleId;
  cycleStates: CycleState[];
  /** Case-insensitive substring of the Ministry name or the Cycle name. */
  search?: string;
  stage?: ScheduleStage;
  /** Only current Schedules that wait on the leader: unfinished, or Published with an open Swap request. */
  attention?: boolean;
  /** Only rows after this position in the list order. */
  after?: ScheduleListPosition;
  limit: number;
  tx?: TransactionContext;
}

/** One active Ministry paired with one Cycle: a Schedule before its facts are read. */
export interface ScheduleCandidateRow {
  ministry: Ministry;
  cycle: Cycle;
}

export interface ScheduleListRow extends ScheduleCandidateRow {
  stage: ScheduleStage;
}

export interface ScheduleRowsPage {
  rows: ScheduleListRow[];
  /** Position of the last row, set only when more rows follow it. */
  next?: ScheduleListPosition;
}

export interface CountSchedulesByStageInput {
  churchId: ChurchId;
  /** The led Ministries a leader is scoped to; omitted for a ChurchAdmin. */
  ministryIds?: MinistryId[];
  tx?: TransactionContext;
}

export interface ScheduleStageCountRow {
  stage: ScheduleStage;
  count: number;
}

export interface ListSchedulesFactsInput {
  churchId: ChurchId;
  ministryIds: MinistryId[];
  cycleIds: CycleId[];
  tx?: TransactionContext;
}

/** One Ministry's part of one Cycle. */
export interface SchedulePair {
  ministryId: MinistryId;
  cycleId: CycleId;
}

/** Facts of exactly these Schedules, not of every Ministry × Cycle among them. */
export interface ListSchedulePairFactsInput {
  churchId: ChurchId;
  schedules: SchedulePair[];
  tx?: TransactionContext;
}

/** One distinct MinistryParticipation state serving a block of a Schedule. */
export interface ScheduleServingStateRow {
  ministryId: string;
  cycleId: string;
  state: ParticipationState;
}

/** A Schedule's AvailabilityChecks still held by active Ministry Memberships. */
export interface ScheduleCheckCountRow {
  ministryId: string;
  cycleId: string;
  confirmed: number;
  asked: number;
}

export interface ScheduleCountRow {
  ministryId: string;
  cycleId: string;
  count: number;
}

export interface ListCycleStaffingInput {
  churchId: ChurchId;
  /** The led Ministries a leader is scoped to; omitted for a ChurchAdmin. */
  ministryIds?: MinistryId[];
  /** How many of the latest Sent or Past Cycles to read. */
  cycleLimit: number;
  tx?: TransactionContext;
}

export interface ListMinistryStaffingInput {
  churchId: ChurchId;
  /** The led Ministries a leader is scoped to; omitted for a ChurchAdmin. */
  ministryIds?: MinistryId[];
  cycleId: CycleId;
  tx?: TransactionContext;
}

/** Headcount of active requirements and the seats their live assignments hold. */
export interface StaffingTotals {
  /** People the requirements ask for. */
  needed: number;
  /** Seats held by a draft or pending assignment, never above `needed` per requirement. */
  filled: number;
}

export interface CycleStaffingRow extends StaffingTotals {
  cycleId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  /** Availability checks not withdrawn, from active memberships. */
  asked: number;
  /** Of `asked`, the checks the volunteer answered. */
  answered: number;
}

export interface MinistryStaffingRow extends StaffingTotals {
  ministryId: string;
  name: string;
}

export interface SaveScheduleLastToldInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: CycleId;
  volunteerId: VolunteerId;
  assignments: ScheduleAssignmentSnapshot[];
  tx: TransactionContext;
}

export interface ListScheduleLastToldInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: CycleId;
  tx?: TransactionContext;
}

export interface ScheduleLastToldRow {
  volunteerId: VolunteerId;
  assignments: ScheduleAssignmentSnapshot[];
  toldAt: Instant;
}

/** One Volunteer's last-told Schedule, named by its Ministry and Cycle. */
export interface ScheduleLastToldBySchedulesRow extends ScheduleLastToldRow {
  ministryId: MinistryId;
  cycleId: CycleId;
}

/** A published participation with the Event it serves; the Event names its Cycle. */
export interface PublishedScheduleParticipation {
  participation: MinistryParticipation;
  event: Event;
}

export interface MinistryParticipationRepository {
  listScheduleLastTold(
    input: ListScheduleLastToldInput,
  ): Promise<ScheduleLastToldRow[]>;
  /** Last-told rows of the Schedules, in one read. */
  listScheduleLastToldBySchedules(
    input: ListSchedulePairFactsInput,
  ): Promise<ScheduleLastToldBySchedulesRow[]>;
  /**
   * Published participations of the Schedules whose Event is not cancelled, in
   * one read: earliest Event first, as `listCycleEvents`.
   */
  listPublishedScheduleParticipations(
    input: ListSchedulePairFactsInput,
  ): Promise<PublishedScheduleParticipation[]>;
  saveScheduleLastTold(input: SaveScheduleLastToldInput): Promise<void>;
  getById(input: GetParticipationInput): Promise<MinistryParticipation>;
  /** Holds the row until `tx` ends, so its state cannot change under the caller. */
  lockById(input: LockParticipationInput): Promise<MinistryParticipation>;
  /** Every participation of the (Ministry, Cycle), locked until commit. */
  lockSchedule(
    input: LockScheduleParticipationsInput,
  ): Promise<MinistryParticipation[]>;
  findByMinistryEvent(
    input: FindParticipationByMinistryEventInput,
  ): Promise<MinistryParticipation | null>;
  create(input: CreateParticipationInput): Promise<MinistryParticipation>;
  listByEvent(
    input: ListParticipationsByEventInput,
  ): Promise<MinistryParticipation[]>;
  /**
   * Whether any Event of the Cycle has inclusions, Shifts, a Participation
   * past preparing, or the Cycle has an availability check.
   */
  hasCycleStaffing(input: HasCycleStaffingInput): Promise<boolean>;
  listByMinistry(
    input: ListParticipationsByMinistryInput,
  ): Promise<MinistryParticipation[]>;
  /** The Ministries' participations in one read, earliest Event first. */
  listByMinistries(
    input: ListParticipationsByMinistriesInput,
  ): Promise<MinistryParticipation[]>;
  listByIds(
    input: ListParticipationsByIdsInput,
  ): Promise<MinistryParticipation[]>;
  updateState(
    input: UpdateParticipationStateInput,
  ): Promise<MinistryParticipation>;
  listInclusions(
    input: ListInclusionsInput,
  ): Promise<ParticipationEventTimeBlockInclusion[]>;
  addInclusion(input: AddInclusionInput): Promise<void>;
  removeInclusion(input: RemoveInclusionInput): Promise<void>;
  touch(input: TouchParticipationInput): Promise<void>;
  /** When the Ministry first asked for availability in the Cycle: its earliest Availability Check. Null before any ask. */
  findAvailabilityRequestedAt(
    input: FindAvailabilityRequestedAtInput,
  ): Promise<Date | null>;
  listScheduleSummaries(
    input: ListScheduleSummariesInput,
  ): Promise<ScheduleSummaryRow[]>;
  /**
   * Active Ministry × Cycle pairs in scope with their stage, filtered and paged in the list order:
   * current Schedules by stage, then Past ones; newest Cycle first, then Ministry name and id.
   */
  listScheduleRows(input: ListScheduleRowsInput): Promise<ScheduleRowsPage>;
  /** Every active Ministry × Sent Cycle pair in scope, per stage; stages with none are left out. */
  countCurrentSchedulesByStage(
    input: CountSchedulesByStageInput,
  ): Promise<ScheduleStageCountRow[]>;
  /** Leaves out opted-out MinistryParticipations and cancelled Events; a cancelled block's inclusion still counts (Ask moves the whole Schedule). */
  listScheduleServingStates(
    input: ListSchedulesFactsInput,
  ): Promise<ScheduleServingStateRow[]>;
  countScheduleLateMarks(
    input: ListSchedulesFactsInput,
  ): Promise<ScheduleCountRow[]>;
  /** Persisted-open requests whose Shift has not started, per Schedule. */
  countScheduleOpenSwapRequests(
    input: ListSchedulesFactsInput,
  ): Promise<ScheduleCountRow[]>;
  /** Unfilled headcount of active, not-started requirements, per Schedule. */
  countScheduleGaps(
    input: ListSchedulesFactsInput,
  ): Promise<ScheduleCountRow[]>;
  countScheduleChecks(
    input: ListSchedulesFactsInput,
  ): Promise<ScheduleCheckCountRow[]>;
  /** The latest Sent or Past Cycles, oldest first, with staffing and availability totals in scope. */
  listCycleStaffing(input: ListCycleStaffingInput): Promise<CycleStaffingRow[]>;
  /** Serving Ministries of one Cycle, least covered first, then by name and id. */
  listMinistryStaffing(
    input: ListMinistryStaffingInput,
  ): Promise<MinistryStaffingRow[]>;
}

export interface ScheduleStagesInput {
  churchId: ChurchId;
  ministryIds?: MinistryId[];
  ministryId?: MinistryId;
  cycleId?: CycleId;
  cycleStates: CycleState[];
  search?: string;
  tx?: TransactionContext;
}

export interface OpenSwapRequestCountsInput {
  churchId: ChurchId;
  ministryIds?: MinistryId[];
  cycleIds?: CycleId[];
  tx?: TransactionContext;
}

export interface AssignmentCountInput {
  statuses: readonly AssignmentStatus[];
}

export interface RequirementStaffingScopeInput {
  churchId: ChurchId;
  ministryIds?: MinistryId[];
}
