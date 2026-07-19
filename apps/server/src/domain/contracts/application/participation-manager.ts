import type {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  PlanningCycleId,
  RoleId,
  ShiftId,
  TeamId,
  TimeSlotId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { Event } from '../../entities/event';
import type { MinistryParticipation } from '../../entities/ministry-participation';
import type {
  MinistryServingProfile,
  ServingProfileEntryInput,
} from '../../entities/ministry-serving-profile';
import type { Shift } from '../../entities/shift';
import type { SlotRequirement } from '../../entities/slot-requirement';
import type { TimeSlot } from '../../entities/time-slot';
import type { ShiftSplitStrategy } from '../../services/shift-splitter';

export interface GetCycleParticipationInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  ministryId: MinistryId;
}

export interface ParticipationSlotView {
  slot: TimeSlot;
  included: boolean;
  shifts: Shift[];
  requirements: SlotRequirement[];
}

export interface ParticipationEventView {
  participation: MinistryParticipation;
  event: Event;
  slots: ParticipationSlotView[];
}

export interface CycleParticipationView {
  events: ParticipationEventView[];
}

export interface GetCycleBuilderDataInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  ministryId: MinistryId;
  userId: UserId;
}

export interface CycleBuilderShiftView {
  shift: Shift;
  requirements: SlotRequirement[];
  assignments: Assignment[];
  eligibleVolunteers: EligibleVolunteerView[];
}

export interface CycleBuilderSlotView {
  slot: TimeSlot;
  included: boolean;
  shifts: CycleBuilderShiftView[];
}

export interface CycleBuilderEventView {
  participation: MinistryParticipation;
  event: Event;
  slots: CycleBuilderSlotView[];
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
  cycleId: PlanningCycleId;
  ministryId: MinistryId;
  userId: UserId;
  confirmBelowFull?: boolean;
}

export interface PublishCycleParticipationOutcome {
  participationId: MinistryParticipationId;
  state: MinistryParticipation['state'];
  requiredCount: number;
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
  timeSlotIds: TimeSlotId[];
}

export interface SplitShiftsManagerInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  timeSlotId: TimeSlotId;
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
  requiredCount: number;
  notes?: string;
}

export interface GetServingProfileInput {
  churchId: ChurchId;
  ministryId: MinistryId;
}

export interface UpsertServingProfileInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  entries: ServingProfileEntryInput[];
}

export interface EligibleVolunteerView {
  volunteerId: VolunteerId;
  volunteerName: string;
  isAvailable: boolean;
  hasConflict: boolean;
  lastServedAt?: Date;
}

export interface ListEligibleVolunteersInput {
  churchId: ChurchId;
  shiftId: ShiftId;
}

export interface ParticipationCompletionView {
  participationId: MinistryParticipationId;
  requiredCount: number;
  assignedCount: number;
  completionPercent: number;
}

export interface GetParticipationCompletionInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
}

export interface PublishParticipationInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  confirmBelowFull?: boolean;
}

export interface ListMinistryCycleSummariesInput {
  churchId: ChurchId;
  ministryId: MinistryId;
}

/** Iteration 3 (research.md R15/R16): one row per locked `PlanningCycle`
 * church-wide, annotated with this ministry's participation data. A cycle
 * the ministry has zero events in still appears, with `isPartOf: false`,
 * `status: 'not_started'`, and `availabilityFiredForAll: false`. */
export interface MinistryCycleSummaryView {
  cycleId: PlanningCycleId;
  name: string;
  startDate: Date;
  endDate: Date;
  isPartOf: boolean;
  eventCount: number;
  slotCount: number;
  status: 'not_started' | 'in_progress' | 'published';
  availabilityFiredForAll: boolean;
  availabilityFiredForAny: boolean;
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
  ): Promise<SlotRequirement>;
  getServingProfile(
    input: GetServingProfileInput,
  ): Promise<MinistryServingProfile[]>;
  upsertServingProfile(
    input: UpsertServingProfileInput,
  ): Promise<MinistryServingProfile[]>;
  listEligibleVolunteers(
    input: ListEligibleVolunteersInput,
  ): Promise<EligibleVolunteerView[]>;
  getCompletion(
    input: GetParticipationCompletionInput,
  ): Promise<ParticipationCompletionView>;
  publish(input: PublishParticipationInput): Promise<void>;
  publishCycle(input: PublishCycleInput): Promise<PublishCycleView>;
  listMinistryCycleSummaries(
    input: ListMinistryCycleSummariesInput,
  ): Promise<MinistryCycleSummaryView[]>;
}
