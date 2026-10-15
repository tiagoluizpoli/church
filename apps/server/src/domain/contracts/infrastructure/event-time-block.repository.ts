import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  RoleId,
} from '../../branded-ids';
import type { EventTimeBlock } from '../../entities/event-time-block';
import type { TransactionContext } from './transaction-context';

export interface CreateEventTimeBlockInput {
  eventId: EventId;
  startTime: Date;
  endTime: Date;
  label?: string;
}

export interface UpdateEventTimeBlockInput {
  startTime?: Date;
  endTime?: Date;
  label?: string;
}

export interface EventTimeBlockRepository {
  getById(
    churchId: ChurchId,
    id: EventTimeBlockId,
    tx?: TransactionContext,
  ): Promise<EventTimeBlock>;

  listByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<EventTimeBlock[]>;

  /** Create a single slot. */
  create(
    churchId: ChurchId,
    input: CreateEventTimeBlockInput,
    tx?: TransactionContext,
  ): Promise<EventTimeBlock>;

  /** Update slot time and/or label. */
  update(
    churchId: ChurchId,
    id: EventTimeBlockId,
    input: UpdateEventTimeBlockInput,
    tx?: TransactionContext,
  ): Promise<EventTimeBlock>;

  /** Delete a single slot by id. */
  deleteById(
    churchId: ChurchId,
    id: EventTimeBlockId,
    tx?: TransactionContext,
  ): Promise<void>;

  /** Find slots in the same event whose time range overlaps the given range. */
  findOverlapping(
    churchId: ChurchId,
    eventId: EventId,
    startTime: Date,
    endTime: Date,
    excludeEventTimeBlockId?: EventTimeBlockId,
    tx?: TransactionContext,
  ): Promise<EventTimeBlock[]>;

  deleteByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<void>;

  /** Count active assignments for a given slot/role pair. */
  countActiveAssignments(
    churchId: ChurchId,
    eventTimeBlockId: EventTimeBlockId,
    roleId: RoleId,
    tx?: TransactionContext,
  ): Promise<number>;
}
