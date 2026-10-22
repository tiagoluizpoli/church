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

export interface GetEventTimeBlockInput {
  churchId: ChurchId;
  eventTimeBlockId: EventTimeBlockId;
  tx?: TransactionContext;
}

export interface EventTimeBlocksByEventInput {
  churchId: ChurchId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface CreateEventTimeBlockRepositoryInput {
  churchId: ChurchId;
  input: CreateEventTimeBlockInput;
  tx?: TransactionContext;
}

export interface UpdateEventTimeBlockRepositoryInput {
  churchId: ChurchId;
  eventTimeBlockId: EventTimeBlockId;
  input: UpdateEventTimeBlockInput;
  tx?: TransactionContext;
}

export interface FindOverlappingEventTimeBlocksInput {
  churchId: ChurchId;
  eventId: EventId;
  startTime: Date;
  endTime: Date;
  excludeEventTimeBlockId?: EventTimeBlockId;
  tx?: TransactionContext;
}

export interface CountActiveAssignmentsInput {
  churchId: ChurchId;
  eventTimeBlockId: EventTimeBlockId;
  roleId: RoleId;
  tx?: TransactionContext;
}

export interface EventTimeBlockRepository {
  getById(input: GetEventTimeBlockInput): Promise<EventTimeBlock>;
  listByEvent(input: EventTimeBlocksByEventInput): Promise<EventTimeBlock[]>;
  /** Create a single event time block. */
  create(input: CreateEventTimeBlockRepositoryInput): Promise<EventTimeBlock>;
  /** Update event time block time and/or label. */
  update(input: UpdateEventTimeBlockRepositoryInput): Promise<EventTimeBlock>;
  /** Delete a single event time block by id. */
  deleteById(input: GetEventTimeBlockInput): Promise<void>;
  /** Find event time blocks in the same event whose time range overlaps the given range. */
  findOverlapping(
    input: FindOverlappingEventTimeBlocksInput,
  ): Promise<EventTimeBlock[]>;
  deleteByEvent(input: EventTimeBlocksByEventInput): Promise<void>;
  /** Count active assignments for a given event time block/role pair. */
  countActiveAssignments(input: CountActiveAssignmentsInput): Promise<number>;
}
