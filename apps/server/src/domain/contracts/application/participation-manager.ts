import type { CalendarDay, Instant, TimeOfDay } from '@church/time';
import type {
  ChurchId,
  CycleId,
  EventTemplateId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  TemplateTimeBlockId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { Cycle } from '../../entities/cycle';
import type { Event } from '../../entities/event';
import type { EventTimeBlock } from '../../entities/event-time-block';
import type { Ministry } from '../../entities/ministry';
import type { MinistryAccessLevel } from '../../entities/ministry-membership';
import type {
  MinistryParticipation,
  ScheduleStage,
} from '../../entities/ministry-participation';
import type { Shift } from '../../entities/shift';
import type { ShiftRequirement } from '../../entities/shift-requirement';
import type {
  UsualSetup,
  UsualSetupEntryInput,
  UsualSetupHeadcount,
} from '../../entities/usual-setup';
import type {
  AppliedProposalAddition,
  AssignmentProposal,
  ProposedAddition,
  ReviewedAddition,
} from '../../services/assignment-proposal';
import type { ShiftSplitStrategy } from '../../services/shift-splitter';

export const TIME_WINDOW_MODE_OPTIONS = ['starts', 'ends', 'within'] as const;
export type TimeWindowMode = (typeof TIME_WINDOW_MODE_OPTIONS)[number];

/** Church-local wall-clock window; an omitted bound leaves that side open. */
export interface CycleTimeWindow {
  mode: TimeWindowMode;
  start?: TimeOfDay;
  end?: TimeOfDay;
}

export interface CycleParticipationFilters {
  /** Church-local day the block starts on. */
  day?: CalendarDay;
  /** Case-insensitive match on the block label or Event title. */
  q?: string;
  timeWindow?: CycleTimeWindow;
  /** Only served blocks with a Shift that has no headcount. */
  needsAttention?: boolean;
}

export interface GetCycleParticipationInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
  filters?: CycleParticipationFilters;
}

export interface ParticipationRequirementView {
  requirement: ShiftRequirement;
  /** Active Assignments on this requirement; cancelled ones are excluded. */
  assignedCount: number;
}

/** What the prepare guards and flags read, always per Shift. */
export interface ParticipationShiftView {
  shift: Shift;
  requirements: ParticipationRequirementView[];
  unavailableMarkCount: number;
  /** Active Assignments on the Shift; cancelled ones are excluded. */
  assignmentCount: number;
  /** The Shift has no ShiftRequirement. */
  flagged: boolean;
}

export interface ParticipationEventTimeBlockView {
  eventTimeBlock: EventTimeBlock;
  included: boolean;
  /**
   * Of the volunteers asked, those who confirmed and marked no Shift of this
   * block unavailable, against the block's busiest Shift headcount (null while
   * a Shift has no headcount or the block has no Shift).
   */
  answerCoverage: { available: number; needed: number | null };
  shifts: ParticipationShiftView[];
  requirements: ParticipationRequirementView[];
  /** A Shift was created after availability was requested, so earlier answers do not cover it. */
  shiftsChangedAfterAsk: boolean;
}

export interface ParticipationEventView {
  participation: MinistryParticipation;
  event: Event;
  /** Generated from an EventTemplate; false for a one-off Event. */
  generatedFromTemplate: boolean;
  eventTimeBlocks: ParticipationEventTimeBlockView[];
}

export interface CycleParticipationView {
  /** Matching blocks only, ordered by block start then id. */
  events: ParticipationEventView[];
  /** Church-local days with a block, over the unfiltered cycle. */
  dayMarkers: CalendarDay[];
  /** Counts over the unfiltered cycle. */
  totals: { blocks: number; needsAttention: number };
}

export interface GetCycleBuilderDataInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
  userId: UserId;
}

export interface CycleBuilderShiftView {
  shift: Shift;
  requirements: CycleBuilderRequirementView[];
  assignments: CycleBuilderAssignmentView[];
  eligibleVolunteers: EligibleVolunteerView[];
}

export interface CycleBuilderAssignmentView {
  assignment: Assignment;
  lateMark: boolean;
}

/** A requirement as the Cycle Builder read returns it. */
export interface CycleBuilderRequirementView {
  requirement: ShiftRequirement;
}

export interface CycleBuilderEventTimeBlockView {
  eventTimeBlock: EventTimeBlock;
  included: boolean;
  shifts: CycleBuilderShiftView[];
}

export interface CycleBuilderEventView {
  participation: MinistryParticipation;
  event: Event;
  eventTimeBlocks: CycleBuilderEventTimeBlockView[];
}

export interface CycleBuilderRoleOption {
  id: RoleId;
  name: string;
}

export interface CycleBuilderView {
  affectedVolunteerCount: number;
  cycle: Cycle;
  events: CycleBuilderEventView[];
  roles: CycleBuilderRoleOption[];
}

export interface PublishCycleInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
  userId: UserId;
  confirmBelowFull?: boolean;
}

export interface SendScheduleUpdatesView {
  notifiedCount: number;
}

export interface PublishCycleParticipationOutcome {
  participationId: MinistryParticipationId;
  state: MinistryParticipation['state'];
  peopleNeeded: number;
  assignedCount: number;
}

export interface PublishCycleView {
  published: boolean;
  belowFull: boolean;
  participations: PublishCycleParticipationOutcome[];
}

export interface ListUsualSetupBlocksInput {
  churchId: ChurchId;
  ministryId: MinistryId;
}

export interface SaveUsualSetupBlockInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  entry: UsualSetupEntryInput;
}

/** A current TemplateTimeBlock with the Ministry's saved entry for it, if any. */
export interface UsualSetupBlockView {
  templateId: EventTemplateId;
  templateName: string;
  /** The weekday of a template weekly on exactly one weekday; otherwise null. */
  weekday: number | null;
  sourceTemplateTimeBlockId: TemplateTimeBlockId;
  label: string;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  order: number;
  entry?: UsualSetup;
  /** Derived, never stored: a serving manual split no longer fits the block. */
  needsReview: boolean;
}

export interface EligibleVolunteerView {
  volunteerId: VolunteerId;
  volunteerName: string;
  answerState: 'available' | 'unanswered' | 'not_asked' | 'unavailable';
  conflict: {
    assignmentId: string;
    ministryName: string;
    eventTitle: string;
    startTime: Instant;
    endTime: Instant;
  } | null;
  lastServedAt?: Instant;
  /**
   * Every role this volunteer is qualified for in the ministry — not only the
   * roles the current shift requires. The builder shows it as the member's
   * standing skill set, so narrowing it to the shift would make the same person
   * read differently from one event time block to the next.
   */
  qualifiedRoleIds: string[];
  /** This volunteer's ministry-wide Ministry Access Level. */
  ministryAccessLevel: MinistryAccessLevel;
}

export interface ListEligibleVolunteersInput {
  churchId: ChurchId;
  shiftId: ShiftId;
}

export interface ParticipationCompletionView {
  participationId: MinistryParticipationId;
  peopleNeeded: number;
  assignedCount: number;
  completionPercent: number;
}

export interface GetParticipationCompletionInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
}

export interface ListScheduleSummariesInput {
  churchId: ChurchId;
  ministryId: MinistryId;
}

/** Iteration 3 (research.md R15/R16): one row per sent `Cycle`
 * church-wide, annotated with this ministry's participation data. A cycle
 * the ministry has zero events in still appears, with `isPartOf: false`,
 * `status: 'not_started'`, and `availabilityRequestedForAll: false`. */
export interface ScheduleSummaryView {
  cycleId: CycleId;
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

/** `current` lists Sent Cycles, `past` Past Cycles, `all` both (current first). */
export const SCHEDULE_LIST_PERIOD_OPTIONS = ['current', 'past', 'all'] as const;
export type ScheduleListPeriod = (typeof SCHEDULE_LIST_PERIOD_OPTIONS)[number];

/** Combined before pagination; a new filter is one more optional field here. */
export interface ScheduleListFilters {
  period: ScheduleListPeriod;
  ministryId?: MinistryId;
  stage?: ScheduleStage;
  /** Case-insensitive substring of the Ministry name or the Cycle name. */
  search?: string;
  /** Only current Schedules that wait on the leader: unfinished, or Published with an open Swap request. */
  attention?: boolean;
}

export interface GetScheduleInsightsInput {
  churchId: ChurchId;
  /** The led Ministries a leader is scoped to; omitted for a ChurchAdmin. */
  ministryIds?: MinistryId[];
}

/** Requirement headcount and seats held; `filled` never exceeds `needed` per requirement. */
export interface StaffingView {
  needed: number;
  filled: number;
}

export interface CycleInsightView extends StaffingView {
  cycleId: string;
  name: string;
  startDate: CalendarDay;
  endDate: CalendarDay;
  asked: number;
  answered: number;
}

export interface MinistryInsightView extends StaffingView {
  ministryId: string;
  name: string;
}

export interface FocusCycleInsightView {
  cycleId: string;
  name: string;
  /** Serving Ministries, least covered first. */
  ministries: MinistryInsightView[];
}

export interface ScheduleInsightsView {
  /** The latest Sent or Past Cycles in scope, oldest first. */
  cycles: CycleInsightView[];
  /** The Cycle running on the Church's today, else the latest one; null without any. */
  focus: FocusCycleInsightView | null;
}

export interface ListSchedulesInput {
  churchId: ChurchId;
  /** The led Ministries a leader is scoped to; omitted for a ChurchAdmin. */
  ministryIds?: MinistryId[];
  filters: ScheduleListFilters;
  /** Opaque position of the last row of the previous page. */
  cursor?: string;
  limit: number;
}

/** One Schedule of a Sent or Past Cycle, within the caller's Ministries. */
export interface GetScheduleInput {
  churchId: ChurchId;
  /** The led Ministries a leader is scoped to; omitted for a ChurchAdmin. */
  ministryIds?: MinistryId[];
  ministryId: MinistryId;
  cycleId: CycleId;
}

export type ScheduleStageCounts = Record<ScheduleStage, number>;

export interface ScheduleMinistryOption {
  id: MinistryId;
  name: string;
}

export interface ScheduleListOptions {
  ministries: ScheduleMinistryOption[];
}

export interface ScheduleListPage {
  schedules: ScheduleView[];
  nextCursor?: string;
  /** Current Schedules per stage in the caller's scope, ignoring the filters and the cursor. */
  counts: ScheduleStageCounts;
  options: ScheduleListOptions;
}

export interface ScheduleAskingView {
  confirmed: number;
  asked: number;
}

/** One Ministry's part of one Sent or Past Cycle. `asking` is set only in that stage. */
export interface ScheduleView {
  affectedVolunteerCount: number;
  ministry: Ministry;
  cycle: Cycle;
  stage: ScheduleStage;
  lateMarkCount: number;
  openSwapRequestCount: number;
  gapCount: number;
  asking?: ScheduleAskingView;
}

/** The complete desired state of one EventTimeBlock for one MinistryParticipation. */
export interface SavePreparationInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  eventTimeBlockId: EventTimeBlockId;
  serves: boolean;
  /** Serving with neither this nor `headcounts` opts a block with no Shifts in. */
  shiftSplit?: ShiftSplitStrategy;
  /** `shiftIndex` points into the submitted split; a zero count is an omission. */
  headcounts?: UsualSetupHeadcount[];
}

export interface GetAssignmentProposalInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
}

export interface ProposedAdditionView extends ProposedAddition {
  volunteerName: string;
}

/** A side-effect-free preview: nothing here is stored or written. */
export interface AssignmentProposalView
  extends Omit<AssignmentProposal, 'additions'> {
  additions: ProposedAdditionView[];
  /** Binds Apply to exactly these additions (ADR 0013). */
  reviewToken: string;
}

export interface ApplyAssignmentProposalInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
  actorId: UserId;
  /** Client-generated per reviewed preview; resent on every retry. */
  applicationKey: string;
  reviewToken: string;
  additions: ReviewedAddition[];
  /** Reviewed pairs to leave out; the token still covers `additions` whole. */
  excludedAdditions: ReviewedAddition[];
}

/** The committed outcome; `replayed` when a retry recovered it. */
export interface AssignmentProposalOutcomeView {
  applicationKey: string;
  appliedAt: Instant;
  replayed: boolean;
  additions: AppliedProposalAddition[];
}

export interface IParticipationManager {
  getCycleParticipation(
    input: GetCycleParticipationInput,
  ): Promise<CycleParticipationView>;
  getCycleBuilderData(
    input: GetCycleBuilderDataInput,
  ): Promise<CycleBuilderView>;
  /** Applies one block's desired state atomically, leaving other blocks untouched. */
  savePreparation(
    input: SavePreparationInput,
  ): Promise<ParticipationEventTimeBlockView>;
  /** Every current block by template name and block order, saved or not. */
  listUsualSetupBlocks(
    input: ListUsualSetupBlocksInput,
  ): Promise<UsualSetupBlockView[]>;
  /** Saves one block's entry, leaving the Ministry's other blocks untouched. */
  saveUsualSetupBlock(
    input: SaveUsualSetupBlockInput,
  ): Promise<UsualSetupBlockView>;
  listEligibleVolunteers(
    input: ListEligibleVolunteersInput,
  ): Promise<EligibleVolunteerView[]>;
  getCompletion(
    input: GetParticipationCompletionInput,
  ): Promise<ParticipationCompletionView>;
  /** Proposes Assignments for one Schedule between Ask and Publish; writes nothing. */
  getAssignmentProposal(
    input: GetAssignmentProposalInput,
  ): Promise<AssignmentProposalView>;
  /** Creates exactly the reviewed additions once, atomically (ADR 0013). */
  applyAssignmentProposal(
    input: ApplyAssignmentProposalInput,
  ): Promise<AssignmentProposalOutcomeView>;
  publishCycle(input: PublishCycleInput): Promise<PublishCycleView>;
  sendScheduleUpdates(
    input: PublishCycleInput,
  ): Promise<SendScheduleUpdatesView>;
  listScheduleSummaries(
    input: ListScheduleSummariesInput,
  ): Promise<ScheduleSummaryView[]>;
  /** Newest Cycle first, then Ministries alphabetically. */
  listSchedules(input: ListSchedulesInput): Promise<ScheduleListPage>;
  /** Staffing and availability totals of the latest Cycles plus per-Ministry coverage of the focus Cycle. */
  getScheduleInsights(
    input: GetScheduleInsightsInput,
  ): Promise<ScheduleInsightsView>;
  /** Throws NotFoundError when the pair is out of scope or its Cycle is a Draft. */
  getSchedule(input: GetScheduleInput): Promise<ScheduleView>;
}
