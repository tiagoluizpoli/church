import type {
  ChurchId,
  EventTimeBlockId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  TeamId,
} from '../../branded-ids';
import type { Shift } from '../../entities/shift';
import type { ShiftRequirement } from '../../entities/shift-requirement';
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

export interface ListShiftsByEventTimeBlockInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  eventTimeBlockId: EventTimeBlockId;
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

export interface DeleteShiftsByEventTimeBlockInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  eventTimeBlockId: EventTimeBlockId;
  tx?: TransactionContext;
}

export interface UpsertShiftRequirementInput {
  churchId: ChurchId;
  shiftId: ShiftId;
  participationId: MinistryParticipationId;
  roleId: RoleId;
  teamId?: TeamId;
  peopleNeeded: number;
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
  listByEventTimeBlock(
    input: ListShiftsByEventTimeBlockInput,
  ): Promise<Shift[]>;
  update(input: UpdateShiftInput): Promise<Shift>;
  deleteById(input: DeleteShiftInput): Promise<void>;
  deleteByEventTimeBlock(
    input: DeleteShiftsByEventTimeBlockInput,
  ): Promise<void>;
  upsertRequirement(
    input: UpsertShiftRequirementInput,
  ): Promise<ShiftRequirement>;
  listRequirementsByParticipation(
    input: ListRequirementsByParticipationInput,
  ): Promise<ShiftRequirement[]>;
}
