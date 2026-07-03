import type {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  PlanningCycleId,
  RoleId,
  ShiftId,
  TeamId,
  TimeSlotId,
} from '../../branded-ids';
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

export interface IParticipationManager {
  getCycleParticipation(
    input: GetCycleParticipationInput,
  ): Promise<CycleParticipationView>;
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
}
