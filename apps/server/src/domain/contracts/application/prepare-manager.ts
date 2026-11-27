import type { CalendarDay, TimeOfDay } from '@church/time';
import type {
  ChurchId,
  CycleId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  RoleId,
  SectorId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { Cycle } from '../../entities/cycle';
import type { Event, EventWithEventTimeBlocks } from '../../entities/event';
import type { EventTimeBlock } from '../../entities/event-time-block';
import type { MinistryParticipation } from '../../entities/ministry-participation';
import type { Shift } from '../../entities/shift';
import type { ShiftRequirement } from '../../entities/shift-requirement';
import type { UnavailableShift } from '../../entities/unavailable-shift';
import type { UsualSetupHeadcount } from '../../entities/usual-setup';
import type { ShiftSplitStrategy } from '../../services/scheduling/shift-splitter.types';
import type { IParticipationReader } from './participation-reader';
import type { IUsualSetupStaffingSeeder } from './usual-setup-staffing-seeder';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { EventTimeBlockRepository } from '@/domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '@/domain/contracts/infrastructure/planning-event.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnavailableShiftRepository } from '@/domain/contracts/infrastructure/unavailable-shift.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

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
  /** The block or its Event was cancelled: it asks for nobody. */
  cancelled: boolean;
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

export interface EnsurePreparationEditableInput {
  cycle: Cycle;
  timeZone: string;
}

export interface PreparationTarget {
  churchId: ChurchId;
  participation: MinistryParticipation;
  eventTimeBlock: EventTimeBlock;
  tx: TransactionContext;
}

export interface OptInPreparationInput extends PreparationTarget {
  timeZone: string;
}

export interface DiscardPreparationInput extends PreparationTarget {
  existingShifts: Shift[];
}

export interface ApplyPreparationGraphInput extends PreparationTarget {
  existingShifts: Shift[];
  shiftSplit?: ShiftSplitStrategy;
  headcounts: UsualSetupHeadcount[];
}

export interface ApplyShiftChangeInput extends PreparationTarget {
  updateLabels: boolean;
  desiredShifts: Shift[];
  change: ShiftChange;
}

export interface ReconcileRequirementsInput extends PreparationTarget {
  current: ShiftRequirement[];
  desired: DesiredRequirement[];
}

export interface LoadShiftResponsesInput {
  churchId: ChurchId;
  participationId: MinistryParticipation['id'];
  tx?: TransactionContext;
}

export interface RequirementPlace {
  shiftId: Shift['id'] | undefined;
  sectorId: SectorId;
  roleId: RoleId;
}

export interface DesiredRequirement extends RequirementPlace {
  shiftId: Shift['id'];
  peopleNeeded: number;
}

export interface LoadEventViewInput {
  churchId: ChurchId;
  eventGroup: EventWithEventTimeBlocks;
  participation: MinistryParticipation;
  availabilityRequestedAt: Date | null;
  /** Volunteers who confirmed their answers to this Cycle's Ask. */
  confirmedVolunteerIds: Set<string>;
  tx: TransactionContext;
}

export interface LoadConfirmedVolunteerIdsInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
  tx: TransactionContext;
}

export interface LoadPreparationViewInput extends PreparationTarget {
  event: Event;
}

export interface ResolveParticipationEventTimeBlockInput {
  churchId: GetCycleParticipationInput['churchId'];
  participation: MinistryParticipation;
  eventTimeBlockId: EventTimeBlockId;
  tx?: TransactionContext;
}

export interface BuildEventViewInput {
  eventGroup: EventWithEventTimeBlocks;
  participation: MinistryParticipation;
  includedEventTimeBlockIds: Set<string>;
  shifts: Shift[];
  requirements: ShiftRequirement[];
  marks: UnavailableShift[];
  assignments: Assignment[];
  availabilityRequestedAt: Date | null;
  confirmedVolunteerIds: Set<string>;
}

export interface DiffShiftsInput {
  existingShifts: Shift[];
  desiredShifts: Shift[];
}

export interface ShiftChange {
  /** The desired Shifts in order, an existing Shift wherever its span survives. */
  shifts: Shift[];
  added: Shift[];
  removed: Shift[];
}

export interface ShiftResponses {
  markCountByShift: Map<string, number>;
  assignmentCountByShift: Map<string, number>;
  assignedCountByRequirement: Map<string, number>;
}

export interface CountShiftResponsesInput {
  marks: UnavailableShift[];
  assignments: Assignment[];
}

export interface AssertNoShiftResponsesInput {
  shifts: Shift[];
  responses: ShiftResponses;
}

export interface AssertHeadcountFloorsInput {
  current: ShiftRequirement[];
  desired: DesiredRequirement[];
  responses: ShiftResponses;
}

export interface CountByInput {
  keys: string[];
}

export interface GroupByInput<Item> {
  items: Item[];
  keyOf: (item: Item) => string;
}

export interface DbPrepareManagerDependencies {
  assignmentRepository: AssignmentRepository;
  churchRepository: ChurchRepository;
  cycleRepository: CycleRepository;
  eventRepository: PlanningEventRepository;
  eventTimeBlockRepository: EventTimeBlockRepository;
  ministryRepository: MinistryRepository;
  participationRepository: MinistryParticipationRepository;
  shiftRepository: ShiftRepository;
  staffingSeeder: IUsualSetupStaffingSeeder;
  unavailableShiftRepository: UnavailableShiftRepository;
  unitOfWork: UnitOfWork;
  participationReader: IParticipationReader;
}

export interface IPrepareManager {
  getCycleParticipation(
    input: GetCycleParticipationInput,
  ): Promise<CycleParticipationView>;
  /** Applies one block's desired state atomically, leaving other blocks untouched. */
  savePreparation(
    input: SavePreparationInput,
  ): Promise<ParticipationEventTimeBlockView>;
}
