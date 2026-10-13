import type { ChurchId, EventId, RoleId, TimeSlotId } from '../../branded-ids';
import type { TimeSlot } from '../../entities/time-slot';
import type { TransactionContext } from './transaction-context';

export interface CreateTimeSlotInput {
  eventId: EventId;
  startTime: Date;
  endTime: Date;
  label?: string;
}

export interface UpdateTimeSlotInput {
  startTime?: Date;
  endTime?: Date;
  label?: string;
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

  /** Create a single slot. */
  create(
    churchId: ChurchId,
    input: CreateTimeSlotInput,
    tx?: TransactionContext,
  ): Promise<TimeSlot>;

  /** Update slot time and/or label. */
  update(
    churchId: ChurchId,
    id: TimeSlotId,
    input: UpdateTimeSlotInput,
    tx?: TransactionContext,
  ): Promise<TimeSlot>;

  /** Delete a single slot by id. */
  deleteById(
    churchId: ChurchId,
    id: TimeSlotId,
    tx?: TransactionContext,
  ): Promise<void>;

  /** Find slots in the same event whose time range overlaps the given range. */
  findOverlapping(
    churchId: ChurchId,
    eventId: EventId,
    startTime: Date,
    endTime: Date,
    excludeSlotId?: TimeSlotId,
    tx?: TransactionContext,
  ): Promise<TimeSlot[]>;

  deleteByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<void>;

  /** Count active assignments for a given slot/role pair. */
  countActiveAssignments(
    churchId: ChurchId,
    slotId: TimeSlotId,
    roleId: RoleId,
    tx?: TransactionContext,
  ): Promise<number>;
}
