import type { Instant, TimeOfDay } from '@church/time';
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
import type { ShiftSplitStrategy } from '../../services/shift-splitter';

export interface GetCycleParticipationInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
}

export interface ParticipationRequirementView {
  requirement: ShiftRequirement;
  /** Active Assignments on this requirement; cancelled and declined are excluded. */
  assignedCount: number;
}

/** What the prepare guards and flags read, always per Shift. */
export interface ParticipationShiftView {
  shift: Shift;
  requirements: ParticipationRequirementView[];
  unavailableMarkCount: number;
  /** Active Assignments on the Shift; cancelled and declined are excluded. */
  assignmentCount: number;
  /** The Shift has no ShiftRequirement. */
  flagged: boolean;
}

export interface ParticipationEventTimeBlockView {
  eventTimeBlock: EventTimeBlock;
  included: boolean;
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
  events: ParticipationEventView[];
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
  assignments: Assignment[];
  eligibleVolunteers: EligibleVolunteerView[];
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
  weekday: number;
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
  isAvailable: boolean;
  hasConflict: boolean;
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

export interface ListSchedulesInput {
  churchId: ChurchId;
  /** The led Ministries a leader is scoped to; omitted for a ChurchAdmin. */
  ministryIds?: MinistryId[];
}

export interface ScheduleAskingView {
  confirmed: number;
  asked: number;
}

/** One Ministry's part of one Sent or Past Cycle. `asking` is set only in that stage. */
export interface ScheduleView {
  ministry: Ministry;
  cycle: Cycle;
  stage: ScheduleStage;
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
  publishCycle(input: PublishCycleInput): Promise<PublishCycleView>;
  listScheduleSummaries(
    input: ListScheduleSummariesInput,
  ): Promise<ScheduleSummaryView[]>;
  /** Newest Cycle first, then Ministries alphabetically. */
  listSchedules(input: ListSchedulesInput): Promise<ScheduleView[]>;
}
