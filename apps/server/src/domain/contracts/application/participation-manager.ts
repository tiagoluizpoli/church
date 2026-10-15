import type { Instant } from '@church/time';
import type {
  ChurchId,
  CycleId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  TeamId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { Event } from '../../entities/event';
import type { EventTimeBlock } from '../../entities/event-time-block';
import type { MinistryAccessLevel } from '../../entities/ministry-membership';
import type { MinistryParticipation } from '../../entities/ministry-participation';
import type { Shift } from '../../entities/shift';
import type { ShiftRequirement } from '../../entities/shift-requirement';
import type {
  UsualSetup,
  UsualSetupEntryInput,
} from '../../entities/usual-setup';
import type { ShiftSplitStrategy } from '../../services/shift-splitter';

export interface GetCycleParticipationInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
}

export interface ParticipationEventTimeBlockView {
  slot: EventTimeBlock;
  included: boolean;
  shifts: Shift[];
  requirements: ShiftRequirement[];
}

export interface ParticipationEventView {
  participation: MinistryParticipation;
  event: Event;
  slots: ParticipationEventTimeBlockView[];
}

export interface CycleParticipationView {
  events: ParticipationEventView[];
}

export interface GetCycleBuilderDataInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
  /** Limits the read model to one led Team; absent for Ministry leaders. */
  teamId?: TeamId;
  userId: UserId;
}

export interface CycleBuilderShiftView {
  shift: Shift;
  requirements: CycleBuilderRequirementView[];
  assignments: Assignment[];
  eligibleVolunteers: EligibleVolunteerView[];
}

/**
 * A requirement plus the actor-scoped authority to mutate its assignments.
 * The capability is computed for the Cycle Builder read; it is never a
 * substitute for mutation-time authorization.
 */
export interface CycleBuilderRequirementView {
  requirement: ShiftRequirement;
  canMutateAssignments: boolean;
}

export interface CycleBuilderEventTimeBlockView {
  slot: EventTimeBlock;
  included: boolean;
  shifts: CycleBuilderShiftView[];
}

export interface CycleBuilderEventView {
  participation: MinistryParticipation;
  event: Event;
  slots: CycleBuilderEventTimeBlockView[];
}

export interface CycleBuilderRoleOption {
  id: RoleId;
  name: string;
}

export interface CycleBuilderView {
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

export interface SetInclusionsInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  eventTimeBlockIds: EventTimeBlockId[];
}

export interface SplitShiftsManagerInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  eventTimeBlockId: EventTimeBlockId;
  strategy: ShiftSplitStrategy;
}

export interface UpdateShiftManagerInput {
  churchId: ChurchId;
  shiftId: ShiftId;
  startTime?: Date;
  endTime?: Date;
  label?: string;
}

export interface DeleteShiftManagerInput {
  churchId: ChurchId;
  shiftId: ShiftId;
}

export interface UpsertRequirementManagerInput {
  churchId: ChurchId;
  shiftId: ShiftId;
  roleId: RoleId;
  teamId?: TeamId;
  peopleNeeded: number;
  notes?: string;
}

export interface GetUsualSetupInput {
  churchId: ChurchId;
  ministryId: MinistryId;
}

export interface UpsertUsualSetupInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  entries: UsualSetupEntryInput[];
}

export interface EligibleVolunteerView {
  volunteerId: VolunteerId;
  volunteerName: string;
  isAvailable: boolean;
  hasConflict: boolean;
  lastServedAt?: Instant;
  /**
   * Every role this volunteer is qualified for in the ministry — not only the
   * roles the current shift requires. The builder shows it as the member's
   * standing skill set, so narrowing it to the shift would make the same person
   * read differently from one slot to the next.
   */
  qualifiedRoleIds: string[];
  /** This volunteer's ministry-wide Ministry Access Level. */
  ministryAccessLevel: MinistryAccessLevel;
  /** Teams within the ministry this volunteer leads (Team Membership `leader` access level). */
  leadTeamIds: string[];
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
  /** Limits summaries to cycles with schedule work for this Team. */
  teamId?: TeamId;
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

export interface IParticipationManager {
  getCycleParticipation(
    input: GetCycleParticipationInput,
  ): Promise<CycleParticipationView>;
  getCycleBuilderData(
    input: GetCycleBuilderDataInput,
  ): Promise<CycleBuilderView>;
  setInclusions(input: SetInclusionsInput): Promise<void>;
  splitShifts(input: SplitShiftsManagerInput): Promise<Shift[]>;
  updateShift(input: UpdateShiftManagerInput): Promise<Shift>;
  deleteShift(input: DeleteShiftManagerInput): Promise<void>;
  upsertRequirement(
    input: UpsertRequirementManagerInput,
  ): Promise<ShiftRequirement>;
  getUsualSetup(input: GetUsualSetupInput): Promise<UsualSetup[]>;
  upsertUsualSetup(input: UpsertUsualSetupInput): Promise<UsualSetup[]>;
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
}
