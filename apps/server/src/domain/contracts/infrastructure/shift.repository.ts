import type {
  ChurchId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  TeamId,
  TimeSlotId,
} from '../../branded-ids';
import type { Shift } from '../../entities/shift';
import type { SlotRequirement } from '../../entities/slot-requirement';
import type { TransactionContext } from './transaction-context';

export interface CreateShiftsInput {
  churchId: ChurchId;
  shifts: Shift[];
  tx?: TransactionContext;
}

export interface GetShiftInput {
  churchId: ChurchId;
  shiftId: ShiftId;
  tx?: TransactionContext;
}

export interface ListShiftsByParticipationInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  tx?: TransactionContext;
}

export interface ListShiftsBySlotInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  timeSlotId: TimeSlotId;
  tx?: TransactionContext;
}

export interface UpdateShiftInput {
  churchId: ChurchId;
  shiftId: ShiftId;
  startTime?: Date;
  endTime?: Date;
  label?: string | null;
  tx?: TransactionContext;
}

export interface DeleteShiftInput {
  churchId: ChurchId;
  shiftId: ShiftId;
  tx?: TransactionContext;
}

export interface DeleteShiftsBySlotInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  timeSlotId: TimeSlotId;
  tx?: TransactionContext;
}

export interface UpsertShiftRequirementInput {
  churchId: ChurchId;
  shiftId: ShiftId;
  participationId: MinistryParticipationId;
  roleId: RoleId;
  teamId?: TeamId;
  requiredCount: number;
  notes?: string;
  tx?: TransactionContext;
}

export interface ListRequirementsByParticipationInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  tx?: TransactionContext;
}

export interface ShiftRepository {
  createMany(input: CreateShiftsInput): Promise<Shift[]>;
  getById(input: GetShiftInput): Promise<Shift>;
  listByParticipation(input: ListShiftsByParticipationInput): Promise<Shift[]>;
  listBySlot(input: ListShiftsBySlotInput): Promise<Shift[]>;
  update(input: UpdateShiftInput): Promise<Shift>;
  deleteById(input: DeleteShiftInput): Promise<void>;
  deleteBySlot(input: DeleteShiftsBySlotInput): Promise<void>;
  upsertRequirement(
    input: UpsertShiftRequirementInput,
  ): Promise<SlotRequirement>;
  listRequirementsByParticipation(
    input: ListRequirementsByParticipationInput,
  ): Promise<SlotRequirement[]>;
}
