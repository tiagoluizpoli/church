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

export interface EventRepository {
  getMinistryId(
    churchId: ChurchId,
    id: EventId,
    tx?: TransactionContext,
  ): Promise<MinistryId>;

  getById(
    churchId: ChurchId,
    id: EventId,
    tx?: TransactionContext,
  ): Promise<Event>;

  getWithEventTimeBlocks(
    churchId: ChurchId,
    id: EventId,
    tx?: TransactionContext,
  ): Promise<EventWithEventTimeBlocks>;

  listByMinistry(
    churchId: ChurchId,
    ministryId: MinistryId,
    status?: EventStatus,
    tx?: TransactionContext,
  ): Promise<Event[]>;

  create(
    churchId: ChurchId,
    input: CreateEventInput,
    tx?: TransactionContext,
  ): Promise<Event>;

  updateStatus(
    churchId: ChurchId,
    id: EventId,
    input: UpdateEventStatusInput,
    tx?: TransactionContext,
  ): Promise<void>;

  update(
    churchId: ChurchId,
    id: EventId,
    input: UpdateEventInput,
    tx?: TransactionContext,
  ): Promise<Event>;
}
