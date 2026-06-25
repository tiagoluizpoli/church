import type { ChurchId } from '../entities/church';
import type { EventId } from '../entities/event';
import type { RoleId } from '../entities/role';
import type { SlotRequirement } from '../entities/slot-requirement';
import type { TeamId } from '../entities/team';
import type { TimeSlot, TimeSlotId } from '../entities/time-slot';
import type { TransactionContext } from './transaction-context';

export interface BulkCreateTimeSlotItem {
  startTime: Date;
  endTime: Date;
  label?: string;
  requirements?: Array<{
    roleId: RoleId;
    teamId?: TeamId;
    requiredCount: number;
    notes?: string;
  }>;
}

export interface BulkCreateTimeSlotsInput {
  eventId: EventId;
  slots: BulkCreateTimeSlotItem[];
}

export interface UpsertSlotRequirementInput {
  roleId: RoleId;
  requiredCount: number;
  teamId?: TeamId;
  notes?: string;
}

export interface TimeSlotRepository {
  getById(
    churchId: ChurchId,
    id: TimeSlotId,
    tx?: TransactionContext,
  ): Promise<TimeSlot>;

  listByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<TimeSlot[]>;

  bulkCreate(
    churchId: ChurchId,
    input: BulkCreateTimeSlotsInput,
    tx?: TransactionContext,
  ): Promise<TimeSlot[]>;

  deleteByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<void>;

  /** Insert or update the slot requirement for a given role within a slot. */
  upsertRequirement(
    churchId: ChurchId,
    slotId: TimeSlotId,
    input: UpsertSlotRequirementInput,
    tx?: TransactionContext,
  ): Promise<SlotRequirement>;

  /** Count active assignments for a given slot/role pair. */
  countActiveAssignments(
    churchId: ChurchId,
    slotId: TimeSlotId,
    roleId: RoleId,
    tx?: TransactionContext,
  ): Promise<number>;
}
