import type { ChurchId } from '../entities/church';
import type { EventId } from '../entities/event';
import type { RoleId } from '../entities/role';
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
}
