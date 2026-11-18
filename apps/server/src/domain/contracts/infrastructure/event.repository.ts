import type {
  ChurchId,
  CycleId,
  EventId,
  EventTemplateId,
  MinistryId,
} from '../../branded-ids';
import type {
  Event,
  EventStatus,
  EventWithEventTimeBlocks,
} from '../../entities/event';
import type { TransactionContext } from './transaction-context';

export interface CreateEventInput {
  cycleId: CycleId;
  sourceTemplateId?: EventTemplateId;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  status?: EventStatus;
}

export interface UpdateEventStatusInput {
  status: EventStatus;
}

export interface UpdateEventInput {
  title?: string;
  start?: Date;
  end?: Date;
}

export interface GetEventInput {
  churchId: ChurchId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface ListEventsByMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  status?: EventStatus;
  tx?: TransactionContext;
}

export interface CreateEventRepositoryInput {
  churchId: ChurchId;
  input: CreateEventInput;
  tx?: TransactionContext;
}

export interface UpdateEventStatusRepositoryInput {
  churchId: ChurchId;
  eventId: EventId;
  input: UpdateEventStatusInput;
  tx?: TransactionContext;
}

export interface UpdateEventRepositoryInput {
  churchId: ChurchId;
  eventId: EventId;
  input: UpdateEventInput;
  tx?: TransactionContext;
}

export interface EventRepository {
  getMinistryId(input: GetEventInput): Promise<MinistryId>;
  getById(input: GetEventInput): Promise<Event>;
  getWithEventTimeBlocks(
    input: GetEventInput,
  ): Promise<EventWithEventTimeBlocks>;
  listByMinistry(input: ListEventsByMinistryInput): Promise<Event[]>;
  create(input: CreateEventRepositoryInput): Promise<Event>;
  updateStatus(input: UpdateEventStatusRepositoryInput): Promise<void>;
  update(input: UpdateEventRepositoryInput): Promise<Event>;
}
