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
import type {
  MinistryParticipation,
  ParticipationState,
} from '../../entities/ministry-participation';
import type { ParticipationEventTimeBlockInclusion } from '../../entities/participation-event-time-block-inclusion';
import type { ScheduleAssignmentSnapshot } from '../../schedule-last-told';
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

export interface ListSchedulesFactsInput {
  churchId: ChurchId;
  ministryIds: MinistryId[];
  cycleIds: CycleId[];
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

export interface MinistryParticipationRepository {
  listScheduleLastTold(
    input: ListScheduleLastToldInput,
  ): Promise<ScheduleLastToldRow[]>;
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
  /** Leaves out opted-out MinistryParticipations and cancelled Events. */
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
}
